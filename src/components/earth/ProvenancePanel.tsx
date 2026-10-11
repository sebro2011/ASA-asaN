/**
 * Scientific data panel: dataset, provider, source URL, observation date,
 * retrieval timestamp, units, coverage and known limitations for everything the
 * workspace currently holds — plus report export that can only be produced from
 * retrieved values.
 */

import React from 'react';
import { useTranslation } from 'react-i18next';
import { Database, Download, FileJson, FileSpreadsheet, FileText } from 'lucide-react';
import { DefinitionRow, InfoNote, Panel, SectionHeading, StatusBadge, formatDateTime } from './EarthPanel';
import { downloadTextFile } from '../../lib/earth/context';
import type { DataStatus } from '../../lib/earth/types';

export interface ProvenanceEntry {
  key: string;
  title: string;
  status: DataStatus;
  dataset: string;
  provider: string;
  sourceUrl: string;
  observation?: string;
  retrievedAt: string;
  coverage?: string;
  units?: string;
  resolution?: string;
  transport?: string;
  note?: string;
  limitations?: string[];
}

interface ProvenancePanelProps {
  entries: ProvenanceEntry[];
  report: { markdown: string; json: string; csv?: string | null; filenameBase: string } | null;
}

export default function ProvenancePanel({ entries, report }: ProvenancePanelProps) {
  const { t } = useTranslation();

  return (
    <Panel className="space-y-4" aria-live="polite">
      <SectionHeading
        icon={Database}
        title={t('earthProvenanceTitle')}
        subtitle={t('earthExportNote')}
        badge={entries.length ? <StatusBadge status={entries.some((entry) => entry.status === 'live') ? 'live' : entries[0].status} /> : undefined}
      />

      {!entries.length ? (
        <InfoNote>{t('earthProvenanceEmpty')}</InfoNote>
      ) : (
        <div className="space-y-3">
          {entries.map((entry) => (
            <div key={entry.key} className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-white">{entry.title}</p>
                <StatusBadge status={entry.status} note={entry.note} />
              </div>
              <dl className="mt-2">
                <DefinitionRow label={t('earthProvenanceDataset')}>{entry.dataset}</DefinitionRow>
                <DefinitionRow label={t('earthProvenanceProvider')}>{entry.provider}</DefinitionRow>
                <DefinitionRow label={t('earthProvenanceSourceUrl')}>
                  <a href={entry.sourceUrl} target="_blank" rel="noreferrer" className="break-all text-cyan-300 underline decoration-dotted">
                    {entry.sourceUrl}
                  </a>
                </DefinitionRow>
                {entry.observation ? <DefinitionRow label={t('earthProvenanceObservation')}>{entry.observation}</DefinitionRow> : null}
                <DefinitionRow label={t('earthProvenanceRetrieved')}>{formatDateTime(entry.retrievedAt)}</DefinitionRow>
                {entry.coverage ? <DefinitionRow label={t('earthProvenanceCoverage')}>{entry.coverage}</DefinitionRow> : null}
                {entry.units ? <DefinitionRow label={t('earthProvenanceUnits')}>{entry.units}</DefinitionRow> : null}
                {entry.resolution ? <DefinitionRow label={t('earthProvenanceResolution')}>{entry.resolution}</DefinitionRow> : null}
                {entry.transport ? <DefinitionRow label={t('earthProvenanceTransport')}>{entry.transport}</DefinitionRow> : null}
              </dl>
              {entry.limitations && entry.limitations.length ? (
                <div className="mt-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-500">{t('earthProvenanceLimitations')}</p>
                  <ul className="mt-1 space-y-1 text-[11px] leading-relaxed text-slate-300">
                    {entry.limitations.slice(0, 5).map((line) => (
                      <li key={line} className="flex gap-2">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-amber-400" />
                        <span>{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">{t('earthExportTitle')}</span>
        <button
          type="button"
          disabled={!report}
          onClick={() => report && downloadTextFile(`${report.filenameBase}.md`, report.markdown, 'text/markdown')}
          className="flex items-center gap-2 rounded-lg border border-cyan-500/40 bg-cyan-500/10 px-3 py-1.5 text-xs text-cyan-100 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          <FileText className="h-3.5 w-3.5" />
          {t('earthExportMarkdown')}
        </button>
        <button
          type="button"
          disabled={!report}
          onClick={() => report && downloadTextFile(`${report.filenameBase}.json`, report.json, 'application/json')}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          <FileJson className="h-3.5 w-3.5" />
          {t('earthExportJson')}
        </button>
        <button
          type="button"
          disabled={!report?.csv}
          onClick={() => report?.csv && downloadTextFile(`${report.filenameBase}.csv`, report.csv, 'text/csv')}
          className="flex items-center gap-2 rounded-lg border border-slate-700 bg-slate-900/70 px-3 py-1.5 text-xs text-slate-200 transition hover:border-cyan-500/50 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
        >
          <FileSpreadsheet className="h-3.5 w-3.5" />
          {t('earthExportCsv')}
        </button>
        {!report ? <span className="text-[11px] text-slate-500">{t('earthExportDisabled')}</span> : null}
        {report ? <Download className="h-3.5 w-3.5 text-slate-500" aria-hidden /> : null}
      </div>
    </Panel>
  );
}
