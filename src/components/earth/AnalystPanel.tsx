/**
 * AI Earth Science Analyst.
 *
 * The panel posts a compact bundle of *retrieved* values to `/api/earth/analyst`.
 * The server answers with strict JSON sections (verified / derived /
 * interpretation / limitations / gaps). If the AI service is not configured or
 * fails — including when the app is hosted without the Express server — the
 * deterministic local engine (`buildLocalAnalystAnswer`) answers from the same
 * bundle, so the workspace never depends on a model to be usable.
 */

import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BrainCircuit, ExternalLink, Link2, Loader2, Send, ShieldCheck, TriangleAlert } from 'lucide-react';
import { InfoNote, Panel, Pill, SectionHeading, formatDateTime } from './EarthPanel';
import { buildLocalAnalystAnswer, type AnalystAnswer, type AnalystContext, type AnalystSectionKind } from '../../lib/earth/analysis';
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

export default function AnalystPanel({ context, lang, aiCapable }: AnalystPanelProps) {
  const { t } = useTranslation();
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState<AnalystAnswer | null>(null);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const suggestions = [t('earthAnalystSuggestion1'), t('earthAnalystSuggestion2'), t('earthAnalystSuggestion3'), t('earthAnalystSuggestion4')];

  const runLocal = (asked: string) => {
    const local = buildLocalAnalystAnswer(asked, context);
    setAnswer(local);
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
      if (!response.ok || !body?.ok) {
        // Any failure path (no key, model error, no server at all) → deterministic answer.
        const local = buildLocalAnalystAnswer(trimmed, context);
        setAnswer(local);
        setNotice(body?.message || t('earthAnalystLocalNotice'));
        return;
      }

      setAnswer({
        sections: body.sections || [],
        sources: (body.sources || []).map((source: any) => ({
          label: source.label,
          url: source.url,
          retrievedAt: body.generatedAt || new Date().toISOString(),
          detail: source.detail
        })),
        provider: 'ai',
        model: body.model,
        generatedAt: body.generatedAt,
        groundedInRetrievedData: Boolean(body.groundedInRetrievedData)
      });
      if (body.droppedSources) {
        setNotice(t('earthAnalystDroppedSources', { count: body.droppedSources }));
      }
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return;
      const local = buildLocalAnalystAnswer(trimmed, context);
      setAnswer(local);
      setNotice(t('earthAnalystLocalNotice'));
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  };

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

        {notice ? <InfoNote tone="amber">{notice}</InfoNote> : null}
      </Panel>

      {answer ? (
        <Panel className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2">
              <Pill tone={answer.provider === 'ai' ? 'cyan' : 'slate'}>
                {answer.provider === 'ai' ? t('earthAnalystProviderAi') : t('earthAnalystProviderLocal')}
              </Pill>
              {answer.model ? <Pill tone="slate">{t('earthAnalystModel', { model: answer.model })}</Pill> : null}
              {answer.groundedInRetrievedData ? (
                <Pill tone="emerald">
                  <ShieldCheck className="h-3 w-3" />
                  retrieved-data only
                </Pill>
              ) : null}
            </div>
            <p className="text-[11px] text-ink-4">{t('earthAnalystGeneratedAt', { time: formatDateTime(answer.generatedAt) })}</p>
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
