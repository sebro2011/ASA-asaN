/**
 * NOVA HYPOTHESIS FORGE — scientific visualisations.
 *
 * Built on the project's existing charting stack: Recharts wrapped in
 * `src/ui/ChartFrame.tsx`, which guarantees a numeric plot height, an HTML
 * legend outside the plot and a data-table alternative.
 *
 * Every point plotted here comes from a normalised observation or a
 * deterministic analysis result. There is no generated, smoothed or synthetic
 * series anywhere in this file.
 */

import { useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ReferenceLine,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  Brush,
} from 'recharts';
import ChartFrame from '../../ui/ChartFrame';
import type { EvidenceItem, Hypothesis, NormalizedSeries } from '../../lib/forge/types';

export const FORGE_COLORS = {
  atmo: '#5ed3f2',
  azure: '#4f8dff',
  signal: '#6ee7b7',
  caution: '#f0c274',
  critical: '#fb7185',
  neutral: '#9fb2cc',
  derived: '#c4b5fd',
  grid: '#17253b',
  axis: '#8494ab',
};

type Translate = TFunction;

const numberFormat = (language: string) =>
  new Intl.NumberFormat(language, { maximumSignificantDigits: 4 });

function formatTime(ms: number, language: string): string {
  const date = new Date(ms);
  if (!Number.isFinite(date.getTime())) return '';
  return date.toLocaleString(language, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'UTC',
  });
}

export interface SeriesOption {
  id: string;
  label: string;
  unit: string;
  datasetId: string;
  series: NormalizedSeries;
}

/** Build selector options from the series actually retrieved. */
export function seriesOptionsFrom(seriesList: NormalizedSeries[]): SeriesOption[] {
  return seriesList
    .filter((series) => series.observations.some((observation) => observation.value !== null))
    .map((series) => ({
      id: series.id,
      label: `${series.label} · ${series.unit}`,
      unit: series.unit,
      datasetId: series.datasetId,
      series,
    }));
}

function buildRows(options: SeriesOption[]) {
  const points = new Map<number, Record<string, number | null>>();
  for (const option of options) {
    for (const observation of option.series.observations) {
      const ms = Date.parse(observation.time);
      if (!Number.isFinite(ms)) continue;
      // Keep the timestamp but never interpolate across a gap.
      const row = points.get(ms) ?? { ms };
      row[option.id] = observation.value;
      points.set(ms, row);
    }
  }
  return [...points.values()].sort((a, b) => (a.ms as number) - (b.ms as number));
}

/**
 * Shared-UTC-axis time-series chart with dataset/variable selection, dual axes
 * for two different units, zoom and a table alternative.
 */
export function TimeSeriesChart({
  options,
  t,
  language,
  title,
  hint,
  defaultSelected,
}: {
  options: SeriesOption[];
  t: Translate;
  language: string;
  title: string;
  hint: string;
  defaultSelected?: string[];
}) {
  const initial = (defaultSelected ?? options.slice(0, 2).map((option) => option.id)).filter((id) =>
    options.some((option) => option.id === id),
  );
  const [selected, setSelected] = useState<string[]>(initial.length > 0 ? initial.slice(0, 2) : options.slice(0, 1).map((option) => option.id));

  const chosen = options.filter((option) => selected.includes(option.id));
  const rows = useMemo(() => buildRows(chosen), [chosen.map((option) => option.id).join('|')]);

  const toggle = (id: string) => {
    setSelected((current) => {
      if (current.includes(id)) return current.filter((entry) => entry !== id);
      return [...current, id].slice(-2);
    });
  };

  const legend = chosen.map((option, index) => ({
    key: option.id,
    label: `${option.label}`,
    color: index === 0 ? FORGE_COLORS.atmo : FORGE_COLORS.azure,
  }));

  const leftUnit = chosen[0]?.unit ?? '—';
  const rightUnit = chosen[1]?.unit ?? leftUnit;

  const table = (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          <th className="text-left">UTC</th>
          {chosen.map((option) => (
            <th key={option.id} className="text-left" title={option.label}>
              {option.series.variableId} ({option.unit})
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.slice(-40).map((row) => (
          <tr key={String(row.ms)}>
            <td className="whitespace-nowrap pr-2">{formatTime(row.ms as number, 'en-GB')}</td>
            {chosen.map((option) => (
              <td key={option.id} className="pr-2">
                {typeof row[option.id] === 'number'
                  ? numberFormat(language).format(row[option.id] as number)
                  : '—'}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <div className="forge-chart">
      <fieldset className="forge-series-picker">
        <legend className="forge-legend">{t('hfSelectSeries')}</legend>
        <div className="forge-series-picker__row">
          {options.map((option) => {
            const active = selected.includes(option.id);
            return (
              <label key={option.id} className={`forge-toggle${active ? ' is-active' : ''}`}>
                <input
                  type="checkbox"
                  checked={active}
                  onChange={() => toggle(option.id)}
                  className="sr-only"
                />
                <span aria-hidden="true" className="forge-toggle__dot" />
                <span className="truncate">
                  {option.series.variableId} · {option.unit}
                </span>
              </label>
            );
          })}
        </div>
        <p className="forge-hint">{t('hfSeriesLimit')}</p>
      </fieldset>

      {chosen.length === 0 ? (
        <p className="forge-empty">{t('hfNoChartData')}</p>
      ) : (
        <ChartFrame
          height={300}
          series={legend}
          xLabel={t('hfTimeAxis')}
          yLabel={`${leftUnit}${chosen[1] ? ` / ${rightUnit}` : ''}`}
          title={title}
          table={table}
          footnote={hint}
        >
          <LineChart data={rows} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
            <CartesianGrid stroke={FORGE_COLORS.grid} strokeDasharray="2 4" />
            <XAxis
              dataKey="ms"
              type="number"
              domain={['dataMin', 'dataMax']}
              scale="time"
              tickFormatter={(value: number) => formatTime(value, 'en-GB')}
              stroke={FORGE_COLORS.axis}
              fontSize={10}
              minTickGap={32}
            />
            <YAxis
              yAxisId="left"
              stroke={FORGE_COLORS.axis}
              fontSize={10}
              width={46}
              label={{ value: leftUnit, angle: -90, position: 'insideLeft', fill: FORGE_COLORS.axis, fontSize: 9 }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke={FORGE_COLORS.axis}
              fontSize={10}
              width={46}
              hide={!chosen[1]}
              label={{ value: rightUnit, angle: 90, position: 'insideRight', fill: FORGE_COLORS.axis, fontSize: 9 }}
            />
            <Tooltip
              contentStyle={{
                background: 'rgba(6, 12, 22, 0.95)',
                border: `1px solid ${FORGE_COLORS.grid}`,
                borderRadius: 10,
                fontSize: 11,
              }}
              labelFormatter={(value) => formatTime(Number(value), language)}
              formatter={(value, name) => {
                const option = chosen.find((entry) => entry.id === String(name));
                return [
                  `${numberFormat(language).format(Number(value))} ${option?.unit ?? ''}`,
                  option?.series.variableId ?? String(name),
                ];
              }}
            />
            {chosen.map((option, index) => (
              <Line
                key={option.id}
                type="linear"
                dataKey={option.id}
                name={option.id}
                yAxisId={index === 0 ? 'left' : 'right'}
                stroke={index === 0 ? FORGE_COLORS.atmo : FORGE_COLORS.azure}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
                connectNulls={false}
              />
            ))}
            {rows.length > 80 ? (
              <Brush dataKey="ms" height={16} stroke={FORGE_COLORS.grid} travellerWidth={6} />
            ) : null}
          </LineChart>
        </ChartFrame>
      )}
    </div>
  );
}

/**
 * Scatter of the driver and response values *as aligned by the engine*.
 * The points come from `AnalysisResult.pairs`, so the picture and the reported
 * correlation coefficient are computed from an identical sample.
 */
export function RelationshipScatter({
  pairs,
  xUnit,
  yUnit,
  t,
  language,
}: {
  pairs: Array<{ x: number; y: number }>;
  xUnit: string;
  yUnit: string;
  t: Translate;
  language: string;
}) {
  return (
    <ChartFrame
      height={260}
      series={[{ key: 'pairs', label: `${xUnit} → ${yUnit}`, color: FORGE_COLORS.azure }]}
      xLabel={xUnit}
      yLabel={yUnit}
      title={t('hfChartScatter')}
      table={
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="text-left">{xUnit}</th>
              <th className="text-left">{yUnit}</th>
            </tr>
          </thead>
          <tbody>
            {pairs.slice(0, 60).map((pair, index) => (
              <tr key={`${pair.x}-${index}`}>
                <td>{numberFormat(language).format(pair.x)}</td>
                <td>{numberFormat(language).format(pair.y)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      footnote={t('hfScatterHint')}
      empty={pairs.length === 0 ? t('hfNoChartData') : undefined}
    >
      <ScatterChart margin={{ top: 8, right: 14, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={FORGE_COLORS.grid} strokeDasharray="2 4" />
        <XAxis
          type="number"
          dataKey="x"
          name={xUnit}
          stroke={FORGE_COLORS.axis}
          fontSize={10}
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value: number) => numberFormat(language).format(value)}
        />
        <YAxis
          type="number"
          dataKey="y"
          name={yUnit}
          stroke={FORGE_COLORS.axis}
          fontSize={10}
          width={46}
          domain={['dataMin', 'dataMax']}
          tickFormatter={(value: number) => numberFormat(language).format(value)}
        />
        <Tooltip
          contentStyle={{
            background: 'rgba(6, 12, 22, 0.95)',
            border: `1px solid ${FORGE_COLORS.grid}`,
            borderRadius: 10,
            fontSize: 11,
          }}
          formatter={(value, name) => [
            numberFormat(language).format(Number(value)),
            String(name) === 'x' ? xUnit : yUnit,
          ]}
        />
        <Scatter data={pairs} fill={FORGE_COLORS.azure} isAnimationActive={false} />
      </ScatterChart>
    </ChartFrame>
  );
}

/** Lagged cross-correlation curve, from the deterministic analysis result. */
export function LagChart({
  points,
  t,
  language,
}: {
  points: Array<{ x: number; y: number | null }>;
  t: Translate;
  language: string;
}) {
  const data = points.map((point) => ({ lag: point.x, r: point.y }));
  const table = (
    <table className="w-full border-collapse text-[11px]">
      <thead>
        <tr>
          <th className="text-left">lag (steps)</th>
          <th className="text-left">r</th>
        </tr>
      </thead>
      <tbody>
        {data.map((row) => (
          <tr key={row.lag}>
            <td>{row.lag}</td>
            <td>{row.r === null ? '—' : numberFormat(language).format(row.r)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
  return (
    <ChartFrame
      height={240}
      series={[{ key: 'r', label: 'r', color: FORGE_COLORS.derived }]}
      xLabel={t('hfLagAxis')}
      yLabel="r"
      title={t('hfChartLag')}
      table={table}
      footnote={t('hfNotationNote')}
      empty={data.length === 0 ? t('hfNoChartData') : undefined}
    >
      <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={FORGE_COLORS.grid} strokeDasharray="2 4" />
        <XAxis dataKey="lag" stroke={FORGE_COLORS.axis} fontSize={10} />
        <YAxis domain={[-1, 1]} stroke={FORGE_COLORS.axis} fontSize={10} width={38} />
        <ReferenceLine x={0} stroke={FORGE_COLORS.axis} strokeDasharray="3 3" />
        <ReferenceLine y={0} stroke={FORGE_COLORS.grid} />
        <Tooltip
          contentStyle={{
            background: 'rgba(6, 12, 22, 0.95)',
            border: `1px solid ${FORGE_COLORS.grid}`,
            borderRadius: 10,
            fontSize: 11,
          }}
          formatter={(value) => [numberFormat(language).format(Number(value)), 'r']}
        />
        <Line
          type="linear"
          dataKey="r"
          stroke={FORGE_COLORS.derived}
          strokeWidth={1.8}
          dot={{ r: 2 }}
          isAnimationActive={false}
        />
      </LineChart>
    </ChartFrame>
  );
}

const CLASSIFICATION_COLORS: Record<string, string> = {
  supporting: FORGE_COLORS.signal,
  contradicting: FORGE_COLORS.critical,
  neutral: FORGE_COLORS.neutral,
  insufficient: FORGE_COLORS.caution,
};

/** Evidence graph: count of items per classification, hypothesis-linked only. */
export function EvidenceChart({
  evidence,
  t,
  language,
}: {
  evidence: EvidenceItem[];
  t: Translate;
  language: string;
}) {
  const data = ['supporting', 'contradicting', 'neutral', 'insufficient'].map((classification) => ({
    classification,
    label: t(`hf${classification.charAt(0).toUpperCase()}${classification.slice(1)}`),
    count: evidence.filter(
      (item) => item.classification === classification && item.hypothesisIds.length > 0,
    ).length,
  }));
  const total = data.reduce((sum, entry) => sum + entry.count, 0);
  return (
    <ChartFrame
      height={220}
      series={data.map((entry) => ({
        key: entry.classification,
        label: entry.label,
        color: CLASSIFICATION_COLORS[entry.classification],
      }))}
      xLabel={t('hfEvidenceLegend')}
      yLabel={t('hfCountAxis')}
      title={t('hfChartEvidence')}
      table={
        <table className="w-full border-collapse text-[11px]">
          <tbody>
            {data.map((entry) => (
              <tr key={entry.classification}>
                <td>{entry.label}</td>
                <td>{entry.count}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      empty={total === 0 ? t('hfNoEvidence') : undefined}
    >
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={FORGE_COLORS.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" stroke={FORGE_COLORS.axis} fontSize={10} />
        <YAxis allowDecimals={false} stroke={FORGE_COLORS.axis} fontSize={10} width={30} />
        <Tooltip
          contentStyle={{
            background: 'rgba(6, 12, 22, 0.95)',
            border: `1px solid ${FORGE_COLORS.grid}`,
            borderRadius: 10,
            fontSize: 11,
          }}
          formatter={(value) => [numberFormat(language).format(Number(value)), t('hfCountAxis')]}
        />
        <Bar dataKey="count" isAnimationActive={false} radius={[4, 4, 0, 0]}>
          {data.map((entry) => (
            <Cell key={entry.classification} fill={CLASSIFICATION_COLORS[entry.classification]} />
          ))}
        </Bar>
      </BarChart>
    </ChartFrame>
  );
}

/** Data-quality graph: coverage and missing counts per retrieved series. */
export function QualityChart({
  seriesList,
  t,
  language,
}: {
  seriesList: NormalizedSeries[];
  t: Translate;
  language: string;
}) {
  const data = seriesList.map((series) => {
    const present = series.observations.filter((observation) => observation.value !== null).length;
    const total = series.observations.length;
    return {
      id: series.id,
      label: series.variableId,
      coverage: total === 0 ? 0 : Math.round((present / total) * 1000) / 10,
      present,
      total,
      expected: series.missing.expected,
    };
  });
  return (
    <ChartFrame
      height={230}
      series={[
        { key: 'coverage', label: t('hfCoverageAxis'), color: FORGE_COLORS.atmo },
      ]}
      xLabel={t('hfVariableLegend')}
      yLabel="%"
      title={t('hfChartQuality')}
      table={
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr>
              <th className="text-left">series</th>
              <th>present</th>
              <th>total</th>
              <th>expected</th>
            </tr>
          </thead>
          <tbody>
            {data.map((row) => (
              <tr key={row.id}>
                <td>{row.id}</td>
                <td>{row.present}</td>
                <td>{row.total}</td>
                <td>{row.expected ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      }
      empty={data.length === 0 ? t('hfNoChartData') : undefined}
    >
      <BarChart data={data} margin={{ top: 8, right: 12, bottom: 4, left: 0 }}>
        <CartesianGrid stroke={FORGE_COLORS.grid} strokeDasharray="2 4" vertical={false} />
        <XAxis dataKey="label" stroke={FORGE_COLORS.axis} fontSize={9} interval={0} angle={-18} textAnchor="end" height={44} />
        <YAxis domain={[0, 100]} stroke={FORGE_COLORS.axis} fontSize={10} width={32} />
        <Tooltip
          contentStyle={{
            background: 'rgba(6, 12, 22, 0.95)',
            border: `1px solid ${FORGE_COLORS.grid}`,
            borderRadius: 10,
            fontSize: 11,
          }}
          formatter={(value) => [`${numberFormat(language).format(Number(value))}%`, t('hfCoverageAxis')]}
        />
        <Bar dataKey="coverage" fill={FORGE_COLORS.atmo} isAnimationActive={false} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ChartFrame>
  );
}

/**
 * Hypothesis relationship graph.
 *
 * A deliberately small, deterministic SVG: hypotheses in the centre, their
 * independent variables on the left and required datasets on the right, with the
 * evidence classification reflected in each hypothesis node's ring. It is a
 * map of the recorded relationships, not a force-directed illustration.
 */
export function HypothesisGraph({
  hypotheses,
  t,
  language,
}: {
  hypotheses: Hypothesis[];
  t: Translate;
  language: string;
}) {
  const width = 680;
  const rowHeight = 52;
  const height = Math.max(180, hypotheses.length * rowHeight + 60);
  const variableLabels = [...new Set(hypotheses.flatMap((hypothesis) => hypothesis.independentVariables))].slice(0, 5);
  const datasetLabels = [...new Set(hypotheses.flatMap((hypothesis) => hypothesis.requiredObservations))].slice(0, 4);
  const centerX = width / 2;

  return (
    <figure className="forge-graph">
      <figcaption className="forge-graph__caption">{t('hfChartHypothesis')}</figcaption>
      <svg
        role="img"
        aria-label={t('hfChartHypothesis')}
        viewBox={`0 0 ${width} ${height}`}
        className="forge-graph__svg"
      >
        <defs>
          <marker id="forge-arrow" markerWidth="7" markerHeight="7" refX="6" refY="3.5" orient="auto">
            <path d="M0,0 L7,3.5 L0,7 z" fill={FORGE_COLORS.axis} opacity="0.7" />
          </marker>
        </defs>

        {variableLabels.map((label, index) => {
          const y = 40 + index * ((height - 60) / Math.max(1, variableLabels.length - 1 || 1));
          return (
            <g key={`var-${label}`}>
              <rect x={4} y={y - 14} width={150} height={28} rx={8} fill="rgba(94,211,242,0.08)" stroke={FORGE_COLORS.grid} />
              <text x={12} y={y + 4} fontSize={9.5} fill={FORGE_COLORS.atmo}>
                {label.length > 24 ? `${label.slice(0, 24)}…` : label}
              </text>
            </g>
          );
        })}

        {hypotheses.map((hypothesis, index) => {
          const y = 40 + index * rowHeight;
          const color = hypothesis.isNull ? FORGE_COLORS.neutral : FORGE_COLORS.azure;
          return (
            <g key={hypothesis.id}>
              <line
                x1={158}
                y1={y}
                x2={centerX - 96}
                y2={y}
                stroke={FORGE_COLORS.grid}
                strokeDasharray="3 4"
                markerEnd="url(#forge-arrow)"
              />
              <rect
                x={centerX - 96}
                y={y - 18}
                width={192}
                height={36}
                rx={10}
                fill="rgba(79,141,255,0.1)"
                stroke={color}
                strokeWidth={hypothesis.isNull ? 1 : 1.6}
              />
              <text x={centerX} y={y - 3} textAnchor="middle" fontSize={9.5} fill="#e7eefb">
                {hypothesis.id} · {t('hfHypothesisLegend')}
              </text>
              <text x={centerX} y={y + 10} textAnchor="middle" fontSize={8.5} fill={FORGE_COLORS.neutral}>
                {hypothesis.template}
              </text>
            </g>
          );
        })}

        {datasetLabels.map((label, index) => {
          const y = 44 + index * ((height - 60) / Math.max(1, datasetLabels.length - 1 || 1));
          return (
            <g key={`ds-${label}`}>
              <line
                x1={centerX + 97}
                y1={height / 2}
                x2={width - 160}
                y2={y}
                stroke={FORGE_COLORS.grid}
                strokeDasharray="2 5"
              />
              <rect x={width - 158} y={y - 16} width={152} height={32} rx={8} fill="rgba(110,231,183,0.06)" stroke={FORGE_COLORS.grid} />
              <text x={width - 150} y={y + 3} fontSize={8.5} fill={FORGE_COLORS.signal}>
                {label.length > 30 ? `${label.slice(0, 30)}…` : label}
              </text>
            </g>
          );
        })}
      </svg>
      <ul className="forge-graph__legend">
        <li>
          <span className="forge-graph__swatch" style={{ background: FORGE_COLORS.atmo }} aria-hidden="true" />
          {t('hfVariableLegend')}
        </li>
        <li>
          <span className="forge-graph__swatch" style={{ background: FORGE_COLORS.azure }} aria-hidden="true" />
          {t('hfHypothesisLegend')}
        </li>
        <li>
          <span className="forge-graph__swatch" style={{ background: FORGE_COLORS.signal }} aria-hidden="true" />
          {t('hfRequiredObservations')}
        </li>
      </ul>
    </figure>
  );
}
