/**
 * AI Earth Science Analyst.
 *
 * The panel posts a compact bundle of *retrieved* values to `/api/earth/analyst`.
 * The server runs the provider chain (Gemini → alternative → local engine) and
 * answers with strict JSON sections (verified / derived / interpretation /
 * limitations / gaps) plus the execution metadata of what actually ran.
 *
 * The UI shows that metadata as-is: which provider answered, whether a fallback
 * happened, how many attempts it took and how long it took. There is no spinner
 * that keeps running after a failure and no "AI" badge on a locally computed
 * answer.
 */

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrainCircuit, ChevronDown, Cpu, ExternalLink, Link2, Loader2, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import { InfoNote, Panel, Pill, SectionHeading, formatDateTime } from './EarthPanel';
import {
  buildLocalAnalystAnswer,
  type AnalystAnswer,
  type AnalystContext,
  type AnalystExecution,
  type AnalystSectionKind
} from '../../lib/earth/analysis';
import { contextForRequest } from '../../lib/earth/context';

interface AnalystPanelProps {
  context: AnalystContext;
  lang: string;
  aiCapable: boolean;
}

const SECTION_STYLES: Record<AnalystSectionKind, { tone: 'emerald' | 'violet' | 'cyan' | 'amber' | 'rose'; key: string }> = {
  verified: { tone: 'emerald', key: 'earthAnalystSectionVerified' },
  derived: { tone: 'violet', key: 'earthAnalystSectionDerived' },
  interpretation: { tone: 'cyan', key: 'earthAnalystSectionInterpretation' },
  limitations: { tone: 'amber', key: 'earthAnalystSectionLimitations' },
  gaps: { tone: 'rose', key: 'earthAnalystSectionGaps' }
};

const NOTICE_KEYS: Record<string, string> = {
  'primary-unavailable': 'earthAnalystNoticePrimaryUnavailable',
  'all-providers-unavailable': 'earthAnalystNoticeAllDown',
  'local-mode': 'earthAnalystNoticeLocalMode',
  'no-observations': 'earthAnalystNoticeNoObservations',
  'model-response-unusable': 'earthAnalystNoticeUnusable'
};

/** Evidence the answer is grounded in — computed from the bundle actually sent. */
function buildEvidence(context: AnalystContext, answer: AnalystAnswer, t: (key: string, options?: Record<string, unknown>) => string) {
  const rows: Array<{ label: string; value: string }> = [];
  rows.push({
    label: t('earthAnalystEvidenceLocation'),
    value: `${context.areaLabel} · ${context.latitude.toFixed(3)}°, ${context.longitude.toFixed(3)}°`
  });
  rows.push({
    label: t('earthAnalystEvidenceDates'),
    value: context.dates.length ? context.dates.join(', ') : t('earthAnalystNotApplicable')
  });
  if (context.power) {
    rows.push({
      label: t('earthAnalystEvidenceWindow'),
      value: `${context.power.firstMonth || '?'} → ${context.power.lastMonth || '?'} · ${context.power.rows} months · ${context.power.available.join(', ') || 'no parameters'}`
    });
    const series = context.power.series || [];
    const cells = series.reduce((total, entry) => total + entry.values.length, 0);
    const missing = series.reduce(
      (total, entry) => total + entry.values.filter((value) => typeof value !== 'number').length,
      0
    );
    if (series.length) {
      rows.push({
        label: t('earthAnalystEvidenceSeries'),
        value: `${series.length} (${series.map((entry) => entry.code).join(', ')})`
      });
      rows.push({
        label: t('earthAnalystEvidenceMissing'),
        value: `${missing} / ${cells} ${missing ? '' : '(none reported)'}`.trim()
      });
    }
    rows.push({ label: 'NASA POWER', value: context.power.sourceUrl });
    rows.push({ label: t('earthProvenanceRetrieved'), value: formatDateTime(context.power.retrievedAt) });
  }
  const computed = answer.localEvidence || [];
  return { rows, computed };
}

export default function AnalystPanel({ context, lang, aiCapable }: AnalystPanelProps) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AnalystAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const suggestions = [t('earthAnalystSuggestion1'), t('earthAnalystSuggestion2'), t('earthAnalystSuggestion3'), t('earthAnalystSuggestion4')];

  /** Deterministic answer computed in the browser — used only when the API itself is unreachable. */
  const runLocal = (asked: string, reason: string) => {
    const local = buildLocalAnalystAnswer(asked, context);
    setAnswer({
      ...local,
      execution: {
        mode: 'local',
        providerId: 'local',
        providerLabel: t('earthAnalystModeLocal'),
        attempts: 0,
        retries: 0,
        fallback: true,
        fallbackReason: reason,
        chain: [],
        noticeCode: 'local-mode'
      }
    });
  };

  const submit = async (asked: string) => {
    const trimmed = asked.trim();
    if (!trimmed) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true);
    setNotice(null);
    setAnswer(null);

    const payload = contextForRequest(context, trimmed);
    try {
      const response = await fetch('/api/earth/analyst', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, lang }),
        signal: controller.signal
      });

      const body = await response.json().catch(() => null);

      // A hard HTTP failure (no server, rate limit, validation) → browser-side engine.
      if (!response.ok || !body?.ok) {
        runLocal(trimmed, body?.code ? String(body.code).toUpperCase() : `HTTP_${response.status}`);
        setNotice(body?.message || t('earthAnalystNoticeLocalMode'));
        return;
      }

      const execution: AnalystExecution = {
        mode: body.mode === 'remote' ? 'remote' : 'local',
        providerId: String(body.provider || 'local'),
        providerLabel: String(body.providerLabel || (body.mode === 'remote' ? body.provider : t('earthAnalystModeLocal'))),
        attempts: Number(body.attempts || 0),
        retries: Number(body.retries || 0),
        fallback: Boolean(body.fallback),
        fallbackReason: body.fallbackReason ? String(body.fallbackReason) : undefined,
        durationMs: typeof body.durationMs === 'number' ? body.durationMs : undefined,
        chain: Array.isArray(body.providerChain) ? body.providerChain : [],
        noticeCode: body.noticeCode ? String(body.noticeCode) : undefined
      };

      setAnswer({
        sections: body.sections || [],
        // The server normalises every source to this shape (server/earth/providers.ts
        // `normaliseAnswer`); anything else it sends is dropped to a label/URL pair.
        sources: ((body.sources || []) as Array<{ label?: string; url?: string; detail?: string }>).map((source) => ({
          label: String(source.label || source.url || ''),
          url: String(source.url || ''),
          retrievedAt: body.generatedAt || new Date().toISOString(),
          detail: source.detail
        })),
        provider: execution.mode === 'remote' ? 'ai' : 'local',
        model: body.model,
        generatedAt: body.generatedAt,
        groundedInRetrievedData: Boolean(body.groundedInRetrievedData),
        execution,
        localEvidence: Array.isArray(body.localEvidence) ? body.localEvidence : [],
        sufficientData: Boolean(body.sufficientData)
      });

      if (execution.noticeCode && NOTICE_KEYS[execution.noticeCode]) {
        setNotice(t(NOTICE_KEYS[execution.noticeCode]));
      } else if (body.droppedSources) {
        setNotice(t('earthAnalystDroppedSources', { count: body.droppedSources }));
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      runLocal(trimmed, 'API_UNREACHABLE');
      setNotice(t('earthAnalystNoticeLocalMode'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

  const execution = answer?.execution;
  const isLocal = execution ? execution.mode === 'local' : answer ? answer.provider === 'local' : false;
  const evidence = answer ? buildEvidence(context, answer, t) : null;

  return (
    <div className="space-y-4">
      <Panel className="space-y-4">
        <SectionHeading
          icon={BrainCircuit}
          title={t('earthAnalystTitle')}
          subtitle={t('earthAnalystIntro')}
          badge={
            <Pill tone={aiCapable ? 'cyan' : 'slate'}>
              <ShieldCheck className="h-3 w-3" />
              {aiCapable ? t('earthAnalystProviderAi') : t('earthAnalystProviderLocal')}
            </Pill>
          }
        />

        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            submit(question);
          }}
        >
          <label htmlFor="earth-analyst-question" className="sr-only">
            {t('earthAnalystTitle')}
          </label>
          <textarea
            id="earth-analyst-question"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t('earthAnalystPlaceholder')}
            rows={3}
            maxLength={600}
            className="w-full resize-y rounded-[10px] border border-line bg-surface/60 p-3 text-sm text-ink placeholder:text-ink-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={loading || !question.trim()}
              aria-busy={loading}
              className="flex items-center gap-2 rounded-[8px] border border-atmo/45 bg-atmo/10 px-4 py-2 text-sm text-atmo-soft transition hover:bg-cyan-500/25 disabled:opacity-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              {loading ? t('earthAnalystThinking') : t('earthAnalystAsk')}
            </button>
            <span className="text-[11px] text-ink-4">{question.length}/600</span>
          </div>
        </form>

        <div>
          <p className="mb-1.5 text-[11px] uppercase tracking-wide text-ink-4">{t('earthAnalystSuggested')}</p>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((suggestion) => (
              <button
                key={suggestion}
                type="button"
                onClick={() => {
                  setQuestion(suggestion);
                  submit(suggestion);
                }}
                className="rounded-[8px] border border-line bg-surface/60 px-2.5 py-1.5 text-xs text-ink-2 transition hover:border-atmo/45 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        {notice ? <InfoNote tone={isLocal ? 'amber' : 'cyan'}>{notice}</InfoNote> : null}
      </Panel>

      {answer ? (
        <Panel className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              {/* True provider identity: local answers are never dressed up as remote AI. */}
              <Pill tone={isLocal ? 'slate' : 'cyan'}>
                {isLocal ? <Cpu className="h-3 w-3" /> : <BrainCircuit className="h-3 w-3" />}
                {execution?.providerLabel || (answer.provider === 'ai' ? t('earthAnalystProviderAi') : t('earthAnalystModeLocal'))}
              </Pill>
              {!isLocal && answer.model ? <Pill tone="slate">{t('earthAnalystModel', { model: answer.model })}</Pill> : null}
              {execution && execution.attempts > 0 ? <Pill tone="slate">{t('earthAnalystAttemptsCount', { count: execution.attempts })}</Pill> : null}
              {execution?.retries ? <Pill tone="amber">{t('earthAnalystRetriesCount', { count: execution.retries })}</Pill> : null}
              {execution?.fallback && !isLocal ? <Pill tone="amber">{t('earthAnalystAttemptError')}</Pill> : null}
              {answer.groundedInRetrievedData ? (
                <Pill tone="emerald">
                  <ShieldCheck className="h-3 w-3" />
                  retrieved-data only
                </Pill>
              ) : null}
            </div>
            <p className="text-[11px] text-ink-4">
              {t('earthAnalystGeneratedAt', { time: formatDateTime(answer.generatedAt) })}
              {execution?.durationMs ? ` · ${t('earthAnalystDuration', { ms: execution.durationMs })}` : ''}
            </p>
          </div>

          <div className="grid gap-3 lg:grid-cols-2">
            {answer.sections
              .filter((section) => section.bullets.length)
              .map((section, index) => {
                const style = SECTION_STYLES[section.kind] || SECTION_STYLES.interpretation;
                const border: Record<string, string> = {
                  emerald: 'border-emerald-500/30 bg-emerald-950/10',
                  violet: 'border-violet-500/30 bg-derived/[0.05]',
                  cyan: 'border-atmo/25 bg-cyan-950/10',
                  amber: 'border-amber-500/30 bg-caution/[0.04]',
                  rose: 'border-rose-500/30 bg-rose-950/10'
                };
                return (
                  <div key={`${section.kind}-${index}`} className={`rounded-[10px] border p-3 ${border[style.tone]}`}>
                    <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-white">
                      {section.kind === 'limitations' || section.kind === 'gaps' ? (
                        <TriangleAlert className="h-3.5 w-3.5" />
                      ) : (
                        <ShieldCheck className="h-3.5 w-3.5" />
                      )}
                      {t(style.key)}
                    </p>
                    <ul className="mt-2 space-y-1.5 text-xs leading-relaxed text-ink-2">
                      {section.bullets.map((bullet) => (
                        <li key={bullet} className="flex gap-2">
                          <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-slate-400" />
                          <span>{bullet}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
          </div>

          {/* Expandable evidence: exactly what was sent, so the answer can be checked. */}
          {evidence ? (
            <details className="group rounded-[10px] border border-line bg-abyss/60 p-3 [&_summary::-webkit-details-marker]:hidden">
              <summary className="flex cursor-pointer items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-ink-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo">
                <span>{t('earthAnalystEvidence')}</span>
                <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
              </summary>
              <dl className="mt-2 space-y-1.5">
                {evidence.rows.map((row) => (
                  <div key={row.label} className="grid grid-cols-[minmax(96px,auto)_1fr] gap-x-3 border-b border-line/50 py-1 text-[11px] last:border-0">
                    <dt className="text-ink-4">{row.label}</dt>
                    <dd className="min-w-0 break-words text-ink-2">{row.value}</dd>
                  </div>
                ))}
              </dl>
              {evidence.computed.length ? (
                <>
                  <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-ink-4">{t('earthAnalystEvidenceComputed')}</p>
                  <ul className="mt-1 space-y-1 text-[11px] text-ink-2">
                    {evidence.computed.map((line) => (
                      <li key={line} className="break-words">
                        {line}
                      </li>
                    ))}
                  </ul>
                </>
              ) : null}
            </details>
          ) : null}

          {/* Provider attempts: the real chain, including skipped providers. */}
          <details className="group rounded-[10px] border border-line bg-abyss/60 p-3 [&_summary::-webkit-details-marker]:hidden">
            <summary className="flex cursor-pointer items-center justify-between gap-2 text-[11px] uppercase tracking-wide text-ink-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-atmo">
              <span>{t('earthAnalystProviderChain')}</span>
              <ChevronDown className="h-3.5 w-3.5 transition group-open:rotate-180" />
            </summary>
            {execution && execution.chain.length ? (
              <ul className="mt-2 space-y-1.5 text-[11px]">
                {execution.chain.map((entry, index) => (
                  <li key={`${entry.provider}-${index}`} className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-[8px] border border-line/60 px-2 py-1">
                    <span className={entry.outcome === 'ok' ? 'text-emerald-300' : entry.outcome === 'error' ? 'text-caution' : 'text-ink-4'}>
                      {entry.providerLabel || entry.provider}
                    </span>
                    {entry.model ? <span className="text-ink-4">{entry.model}</span> : null}
                    <span className="text-ink-4">
                      {entry.outcome === 'ok'
                        ? t('earthAnalystAttemptOk')
                        : entry.outcome === 'error'
                          ? t('earthAnalystAttemptError')
                          : t('earthAnalystAttemptSkipped')}
                    </span>
                    {entry.code ? <span className="text-ink-4">· {entry.code}</span> : null}
                    {entry.status ? <span className="text-ink-4">· HTTP {entry.status}</span> : null}
                    {entry.attempts ? <span className="text-ink-4">· {t('earthAnalystAttemptsCount', { count: entry.attempts })}</span> : null}
                    {entry.ms ? <span className="text-ink-4">· {t('earthAnalystDuration', { ms: entry.ms })}</span> : null}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="mt-2 text-[11px] text-ink-4">{t('earthAnalystProviderChainEmpty')}</p>
            )}
            {execution?.fallbackReason ? (
              <p className="mt-2 text-[11px] text-ink-4">{t('earthAnalystFallbackReason', { reason: execution.fallbackReason })}</p>
            ) : null}
          </details>

          {answer.sources.length ? (
            <div>
              <p className="mb-1.5 flex items-center gap-2 text-[11px] uppercase tracking-wide text-ink-4">
                <Link2 className="h-3.5 w-3.5" />
                {t('earthAnalystSources')}
              </p>
              <ul className="space-y-1.5">
                {answer.sources.map((source) => (
                  <li key={`${source.url}-${source.label}`} className="rounded-[8px] border border-line bg-abyss/70 p-2.5 text-xs">
                    <a
                      href={source.url}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 break-all text-atmo underline decoration-dotted"
                    >
                      {source.label} <ExternalLink className="h-3 w-3 shrink-0" />
                    </a>
                    <p className="mt-0.5 text-[11px] text-ink-4">
                      {t('earthProvenanceRetrieved')}: {formatDateTime(source.retrievedAt)}
                      {source.detail ? ` · ${source.detail}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Panel>
      ) : null}
    </div>
  );
}
