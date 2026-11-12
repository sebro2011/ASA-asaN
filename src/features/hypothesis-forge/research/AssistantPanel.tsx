/**
 * Contextual research assistant.
 *
 * The panel sends only `buildResearchContext(project)` — a bounded, structured
 * projection — to the server, and renders whichever of two labelled outcomes
 * comes back:
 *
 *   remote — a model answer that passed the server's citation and number gates;
 *   local  — a deterministic summary of the user's own records, explicitly not AI.
 *
 * It never fills a gap itself: if the request fails, the failure is shown and the
 * question stays in the box rather than being answered locally behind the user's
 * back.
 */

import { useMemo, useState } from 'react';
import { buildResearchContext, type ResearchContext } from '../../../lib/forge/research/context';
import type { ResearchProject } from '../../../lib/forge/research/project';
import { Badge, Empty, Labeled, TextArea } from './controls';

type Translate = (key: string) => string;

interface AssistantAnswer {
  answer: string;
  citations: string[];
  uncertainties: string[];
  nextStep: string;
}

interface AssistantBrief {
  mode: 'local';
  summary: string;
  sections: Array<{ title: string; lines: string[] }>;
  citations: string[];
  caveat: string;
}

interface AssistantResponse {
  ok: boolean;
  mode?: 'remote' | 'local';
  noticeCode?: string | null;
  providerLabel?: string;
  answer?: AssistantAnswer | null;
  brief?: AssistantBrief;
  rejectedCode?: string | null;
  error?: string;
  code?: string;
}

const NOTICE_TEXT: Record<string, string> = {
  'local-mode': 'No model provider is configured on this deployment. This is a deterministic summary of your records.',
  'all-providers-unavailable': 'No provider could be reached. This is a deterministic summary of your records.',
  'model-response-unusable':
    'A model answered, but its answer did not survive validation (an unsupported citation, a number that was not in the project, or a claim of proof). The deterministic summary is shown instead.',
  'primary-unavailable': 'The primary provider was unavailable; a fallback provider answered.',
};

export function AssistantPanel({
  project,
  selectedHypothesisId,
  t,
}: {
  project: ResearchProject;
  selectedHypothesisId: string | null;
  t: Translate;
}) {
  const [question, setQuestion] = useState('');
  const [state, setState] = useState<AssistantResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const context = useMemo<ResearchContext>(
    () => buildResearchContext(project, { selectedHypothesisId }),
    [project, selectedHypothesisId],
  );

  const ask = async () => {
    const text = question.trim();
    if (text.length < 4) {
      setError('Ask a complete question (at least a few words).');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await fetch('/api/forge/assistant', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ question: text, context, language: project.language }),
      });
      const payload = (await response.json()) as AssistantResponse;
      if (!response.ok || !payload.ok) {
        setError(payload.error ?? 'The assistant could not answer. Nothing was changed.');
        setState(null);
        return;
      }
      setState(payload);
    } catch {
      setError('The workspace server could not be reached, so the question was not answered.');
      setState(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fr-panel">
      <p className="fr-hint">{t('frAssistantHint')}</p>
      <Labeled label={t('frAsk')} wide>
        <TextArea
          rows={3}
          value={question}
          placeholder={t('frAskPlaceholder')}
          onChange={(value) => setQuestion(value)}
        />
      </Labeled>
      <div className="fr-actions">
        <button type="button" className="fr-btn fr-btn--primary" onClick={ask} disabled={busy}>
          {busy ? t('frSaving') : t('frAsk')}
        </button>
        {state ? (
          <Badge tone={state.mode === 'remote' ? 'ok' : 'warn'}>
            {state.mode === 'remote' ? t('frRemoteMode') : t('frLocalMode')}
          </Badge>
        ) : null}
        {state?.providerLabel ? <span className="fr-muted">{state.providerLabel}</span> : null}
      </div>

      {error ? (
        <p className="fr-refusal" role="alert">
          {error}
        </p>
      ) : null}

      {state && state.mode === 'remote' && state.answer ? (
        <section className="fr-block">
          <p className="fr-answer">{state.answer.answer}</p>
          {state.answer.citations.length > 0 ? (
            <p className="fr-muted">
              {t('frCitations')}: {state.answer.citations.join(', ')}
            </p>
          ) : null}
          {state.answer.uncertainties.length > 0 ? (
            <>
              <h4>{t('frUncertainties')}</h4>
              <ul className="fr-limits">
                {state.answer.uncertainties.map((entry) => (
                  <li key={entry}>{entry}</li>
                ))}
              </ul>
            </>
          ) : null}
          {state.answer.nextStep ? (
            <p className="fr-feedback">
              {t('frNextStep')}: {state.answer.nextStep}
            </p>
          ) : null}
          {state.noticeCode ? <p className="fr-hint">{NOTICE_TEXT[state.noticeCode] ?? state.noticeCode}</p> : null}
        </section>
      ) : null}

      {state && state.mode === 'local' && state.brief ? (
        <section className="fr-block">
          {state.noticeCode ? <p className="fr-hint">{NOTICE_TEXT[state.noticeCode] ?? state.noticeCode}</p> : null}
          <p className="fr-answer">{state.brief.summary}</p>
          {state.brief.sections.map((section) => (
            <div key={section.title} className="fr-brief">
              <h4>{section.title}</h4>
              <ul className="fr-limits">
                {section.lines.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </div>
          ))}
          {state.brief.citations.length > 0 ? (
            <p className="fr-muted">
              {t('frCitations')}: {state.brief.citations.join(', ')}
            </p>
          ) : null}
          <p className="fr-hint">{state.brief.caveat}</p>
          {state.rejectedCode ? (
            <p className="fr-muted">
              {t('frRejected')} — <span className="fr-mono">{state.rejectedCode}</span>
            </p>
          ) : null}
        </section>
      ) : null}

      {!state && !error ? <Empty>{t('frAskPlaceholder')}</Empty> : null}
    </div>
  );
}
