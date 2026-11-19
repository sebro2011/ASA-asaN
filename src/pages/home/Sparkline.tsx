'use client';

/**
 * Sparkline — dependency-free SVG series renderer.
 *
 * Deliberately not a charting library: the home preview must render in a
 * measurable box without ResizeObserver, and the full charting surface lives in
 * the Earth Intelligence Lab. Axes, units, provenance and an accessible table
 * alternative are all required, so the graphic can be read by a screen reader
 * and audited by a scientist.
 */

import React, { useMemo } from 'react';

export interface SparklinePoint {
  year: number;
  mean: number | null;
  complete?: boolean;
}

export function Sparkline({
  points,
  unit,
  label,
  height = 132
}: {
  points: SparklinePoint[];
  unit: string;
  label: string;
  height?: number;
}) {
  const geometry = useMemo(() => {
    const valid = points.filter((point): point is SparklinePoint & { mean: number } => typeof point.mean === 'number');
    if (valid.length < 2) return null;

    // The current year arrives incomplete (NASA POWER returns the months it has
    // so far). Its mean covers a different part of the year than the others, so
    // it is not an annual mean: it is drawn hollow, joined by a dashed segment,
    // and left out of the trend line and of the period mean.
    const partial = valid.filter((point) => point.complete === false);
    const complete = valid.filter((point) => point.complete !== false);
    const basis = complete.length >= 2 ? complete : valid;
    const hasPartial = partial.length > 0 && complete.length >= 2;

    const width = 640;
    const padX = 34;
    const padTop = 12;
    const padBottom = 26;
    const innerW = width - padX * 2;
    const innerH = height - padTop - padBottom;

    const values = valid.map((point) => point.mean);
    const rawMin = Math.min(...values);
    const rawMax = Math.max(...values);
    const span = rawMax - rawMin || 1;
    // Small padding so the extremes never touch the frame.
    const min = rawMin - span * 0.14;
    const max = rawMax + span * 0.14;

    const firstYear = valid[0].year;
    const lastYear = valid[valid.length - 1].year;
    const yearSpan = lastYear - firstYear || 1;

    const x = (year: number) => padX + ((year - firstYear) / yearSpan) * innerW;
    const y = (value: number) => padTop + (1 - (value - min) / (max - min)) * innerH;

    const line = basis.map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.year).toFixed(2)},${y(point.mean).toFixed(2)}`).join(' ');
    const lastBasis = basis[basis.length - 1];
    const area = `${line} L${x(lastBasis.year).toFixed(2)},${(padTop + innerH).toFixed(2)} L${x(basis[0].year).toFixed(2)},${(padTop + innerH).toFixed(2)} Z`;

    // Dashed connector from the last complete year to the year in progress, so
    // the eye sees a provisional value without reading it as the next data point
    // of the trend.
    const partialPath = hasPartial
      ? basis
          .slice(-1)
          .concat(partial)
          .map((point, index) => `${index === 0 ? 'M' : 'L'}${x(point.year).toFixed(2)},${y(point.mean).toFixed(2)}`)
          .join(' ')
      : '';

    const mean = basis.reduce((sum, point) => sum + point.mean, 0) / basis.length;

    return {
      width,
      height,
      padX,
      padTop,
      innerH,
      line,
      area,
      partialPath,
      hasPartial,
      meanY: y(mean),
      firstYear,
      lastYear,
      min,
      max,
      trendYears: `${basis[0].year}–${basis[basis.length - 1].year}`,
      partialLabel: hasPartial ? partial.map((point) => point.year).join(', ') : '',
      points: valid.map((point) => ({
        ...point,
        cx: x(point.year),
        cy: y(point.mean),
        provisional: point.complete === false
      }))
    };
  }, [points, height]);

  if (!geometry) {
    return (
      <div className="flex h-[132px] items-center justify-center rounded-[10px] border border-dashed border-line text-xs text-ink-4">
        Not enough complete years to plot a series
      </div>
    );
  }

  return (
    <figure className="m-0">
      <svg
        viewBox={`0 0 ${geometry.width} ${height}`}
        role="img"
        aria-label={`${label} — annual means ${geometry.firstYear} to ${geometry.lastYear}, in ${unit}${
          geometry.hasPartial ? `; ${geometry.partialLabel} is still in progress and excluded from the trend` : ''
        }`}
        className="w-full"
        style={{ height }}
        preserveAspectRatio="none"
      >
        <defs>
          <linearGradient id="spark-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#5ed3f2" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#5ed3f2" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 0.5, 1].map((fraction) => (
          <line
            key={fraction}
            x1={geometry.padX}
            x2={geometry.width - geometry.padX}
            y1={geometry.padTop + geometry.innerH * fraction}
            y2={geometry.padTop + geometry.innerH * fraction}
            stroke="rgba(148,178,214,0.14)"
            strokeWidth="1"
          />
        ))}

        <path d={geometry.area} fill="url(#spark-fill)" />
        <path d={geometry.line} fill="none" stroke="#5ed3f2" strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round" />

        <line
          x1={geometry.padX}
          x2={geometry.width - geometry.padX}
          y1={geometry.meanY}
          y2={geometry.meanY}
          stroke="rgba(167,232,250,0.5)"
          strokeDasharray="4 4"
          strokeWidth="1"
        />

        {geometry.partialPath ? (
          <path
            d={geometry.partialPath}
            fill="none"
            stroke="rgba(167,232,250,0.55)"
            strokeWidth="1.4"
            strokeDasharray="3 3"
            strokeLinecap="round"
          />
        ) : null}

        {geometry.points.map((point) =>
          point.provisional ? (
            <circle
              key={point.year}
              cx={point.cx}
              cy={point.cy}
              r="2.6"
              fill="#0a1524"
              stroke="#a7e8fa"
              strokeWidth="1.2"
              data-incomplete="true"
            />
          ) : (
            <circle key={point.year} cx={point.cx} cy={point.cy} r="1.9" fill="#a7e8fa" />
          )
        )}

        <text x={geometry.padX} y={height - 6} fill="#5f7290" fontSize="10" fontFamily="JetBrains Mono, monospace">
          {geometry.firstYear}
        </text>
        <text
          x={geometry.width - geometry.padX}
          y={height - 6}
          textAnchor="end"
          fill="#5f7290"
          fontSize="10"
          fontFamily="JetBrains Mono, monospace"
        >
          {geometry.lastYear}
        </text>
        <text x={geometry.padX} y={geometry.padTop + 4} fill="#8294ad" fontSize="10" fontFamily="JetBrains Mono, monospace">
          {unit}
        </text>
      </svg>

      <figcaption className="mt-2 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 font-mono text-[10px] leading-relaxed text-ink-4">
        <span>
          Annual mean · dashed line = period mean
          {geometry.hasPartial ? ` · ${geometry.partialLabel} in progress, not in ${geometry.trendYears}` : ''}
        </span>
        <details className="relative">
          <summary className="cursor-pointer list-none text-ink-3 underline decoration-dotted underline-offset-2 hover:text-ink">
            data table
          </summary>
          <div className="absolute bottom-full right-0 z-10 mb-2 max-h-56 w-44 overflow-auto rounded-lg border border-line bg-abyss p-2 shadow-xl">
            <table className="w-full text-left text-[10px]">
              <caption className="sr-only">{label} annual means</caption>
              <thead>
                <tr className="text-ink-4">
                  <th scope="col" className="pb-1 font-normal">Year</th>
                  <th scope="col" className="pb-1 text-right font-normal">{unit}</th>
                </tr>
              </thead>
              <tbody>
                {points.map((point) => (
                  <tr key={point.year} className="text-ink-2">
                    <td>{point.year}</td>
                    <td className="text-right tabular-nums">
                      {typeof point.mean === 'number' ? point.mean.toFixed(2) : '—'}
                      {point.complete === false ? '*' : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-1 text-[9px] leading-snug text-ink-4">* incomplete year</p>
          </div>
        </details>
      </figcaption>
    </figure>
  );
}

export default Sparkline;
