/**
 * Evidence panel: record, link, inspect.
 *
 * Two rules are visible in the UI rather than hidden in the engine:
 *  - a record without a resolvable identifier stays visible but is marked
 *    unverified, and its stance cannot be counted as decisive;
 *  - evidence is always *about* a hypothesis — the panel shows per-hypothesis
 *    counts and never a single "evidence score" for the project.
 */

import { useMemo, useState } from 'react';
import {
  SOURCE_CAVEAT,
  evidenceBalance,
  formatCitation,
  rankEvidence,
  validateEvidenceRecord,
  type EvidenceRecord,
  type EvidenceSourceType,
  type EvidenceStance,
} from '../../../lib/forge/research/evidenceIntel';
import {
  newId,
  removeEvidence,
  setEvidenceLink,
  upsertEvidence,
  type ResearchProject,
} from '../../../lib/forge/research/project';
import { Badge, Empty, Labeled, Select, TextArea, TextInput } from './controls';

type Translate = (key: string) => string;

const STANCES: EvidenceStance[] = ['supporting', 'contradicting', 'neutral', 'insufficient', 'unverified'];
const SOURCES: EvidenceSourceType[] = ['peer-reviewed', 'official-dataset', 'preprint', 'secondary', 'ai-generated'];

const STANCE_TONE: Record<EvidenceStance, 'ok' | 'bad' | 'neutral' | 'warn'> = {
  supporting: 'ok',
  contradicting: 'bad',
  neutral: 'neutral',
  insufficient: 'warn',
  unverified: 'warn',
};

interface Draft {
  title: string;
  authors: string;
  url: string;
  doi: string;
  publisher: string;
  observation: string;
  unit: string;
  method: string;
  limitations: string;
  sourceType: EvidenceSourceType;
  stance: EvidenceStance;
  fullText: EvidenceRecord['fullText'];
}

const blankDraft = (): Draft => ({
  title: '',
  authors: '',
  url: '',
  doi: '',
  publisher: '',
  observation: '',
  unit: '',
  method: '',
  limitations: '',
  sourceType: 'official-dataset',
  stance: 'neutral',
  fullText: 'metadata-only',
});

export function EvidencePanel({
  project,
  update,
  t,
}: {
  project: ResearchProject;
  update: (mutate: (project: ResearchProject) => ResearchProject) => void;
  t: Translate;
}) {
  const [draft, setDraft] = useState<Draft>(blankDraft);
  const [linkTo, setLinkTo] = useState<string>(project.hypotheses[0]?.id ?? '');
  const [feedback, setFeedback] = useState<string | null>(null);

  const ranked = useMemo(() => rankEvidence(project.evidence), [project.evidence]);

  const save = () => {
    if (!draft.title.trim()) {
      setFeedback('A record needs at least a title. Nothing was saved.');
      return;
    }
    const base: Omit<EvidenceRecord, 'verification' | 'verificationNote'> = {
      id: newId('evd'),
      title: draft.title.trim(),
      authors: draft.authors
        .split(',')
        .map((author) => author.trim())
        .filter(Boolean),
      url: draft.url.trim() || null,
      doi: draft.doi.trim() || null,
      publisher: draft.publisher.trim() || null,
      publishedAt: null,
      retrievedAt: new Date().toISOString(),
      datasetId: null,
      datasetVersion: null,
      observation: draft.observation.trim(),
      unit: draft.unit.trim(),
      method: draft.method.trim(),
      limitations: draft.limitations
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean),
      citation: [draft.authors.trim() || 'Authors not recorded', draft.title.trim(), draft.publisher.trim()]
        .filter(Boolean)
        .join('. '),
      sourceType: draft.sourceType,
      stance: draft.stance,
      hypothesisIds: linkTo ? [linkTo] : [],
      fullText: draft.fullText,
      origin: 'user',
      accessNote:
        draft.fullText === 'full'
          ? 'Read in full by the researcher. The Forge has not independently checked the text.'
          : `Available as ${draft.fullText.replace('-', ' ')} only.`,
    };
    const validation = validateEvidenceRecord({ ...base, verification: 'unverified', verificationNote: '' });
    const record: EvidenceRecord = { ...base, verification: validation.verification, verificationNote: validation.note };
    update((current) => upsertEvidence(current, record));
    setFeedback(`${validation.verification}: ${validation.note}`);
    setDraft(blankDraft());
  };

  return (
    <div className="fr-panel">
      <section className="fr-block">
        <h4>{t('frAddEvidence')}</h4>
        <div className="fr-grid fr-grid--two">
          <Labeled label={t('frFStatement')}>
            <TextInput value={draft.title} onChange={(title) => setDraft((current) => ({ ...current, title }))} />
          </Labeled>
          <Labeled label={t('frPublisher')}>
            <TextInput value={draft.publisher} onChange={(publisher) => setDraft((current) => ({ ...current, publisher }))} />
          </Labeled>
          <Labeled label={t('frIdentifier')}>
            <TextInput
              value={draft.doi}
              placeholder="10.1029/..."
              onChange={(doi) => setDraft((current) => ({ ...current, doi }))}
            />
          </Labeled>
          <Labeled label="URL">
            <TextInput
              type="url"
              value={draft.url}
              placeholder="https://"
              onChange={(url) => setDraft((current) => ({ ...current, url }))}
            />
          </Labeled>
          <Labeled label={t('frSourceType')}>
            <Select
              value={draft.sourceType}
              onChange={(sourceType) => setDraft((current) => ({ ...current, sourceType }))}
              options={SOURCES.map((source) => ({ value: source, label: source }))}
            />
          </Labeled>
          <Labeled label={t('frStance')}>
            <Select
              value={draft.stance}
              onChange={(stance) => setDraft((current) => ({ ...current, stance }))}
              options={STANCES.map((stance) => ({ value: stance, label: stance }))}
            />
          </Labeled>
          <Labeled label={t('frFullText')}>
            <Select
              value={draft.fullText}
              onChange={(fullText) => setDraft((current) => ({ ...current, fullText }))}
              options={[
                { value: 'full', label: 'full' },
                { value: 'abstract', label: 'abstract' },
                { value: 'metadata-only', label: 'metadata-only' },
              ]}
            />
          </Labeled>
          <Labeled label={t('frLinkTo')}>
            <Select
              value={linkTo}
              onChange={setLinkTo}
              options={[{ value: '', label: '—' }, ...project.hypotheses.map((hypothesis, index) => ({ value: hypothesis.id, label: `H${index + 1}` }))]}
            />
          </Labeled>
        </div>
        <Labeled label={t('frObservation')} wide>
          <TextArea rows={2} value={draft.observation} onChange={(observation) => setDraft((current) => ({ ...current, observation }))} />
        </Labeled>
        <Labeled label={t('frLimitationsField')} wide>
          <TextArea
            rows={2}
            value={draft.limitations}
            placeholder="One per line"
            onChange={(limitations) => setDraft((current) => ({ ...current, limitations }))}
          />
        </Labeled>
        <div className="fr-actions">
          <button type="button" className="fr-btn fr-btn--primary" onClick={save}>
            {t('frAdd')}
          </button>
          {feedback ? (
            <span className="fr-feedback" role="status">
              {t('frValidation')}: {feedback}
            </span>
          ) : null}
        </div>
        <p className="fr-hint">{SOURCE_CAVEAT[draft.sourceType]}</p>
      </section>

      <section className="fr-block">
        <h4>{t('frEvidence')}</h4>
        {ranked.length === 0 ? (
          <Empty>{t('frNoEvidence')}</Empty>
        ) : (
          <ul className="fr-evidence">
            {ranked.map((record) => (
              <li key={record.id} className="fr-evidence__item">
                <header>
                  <strong>{record.title}</strong>
                  <Badge tone={STANCE_TONE[record.stance]}>{record.stance}</Badge>
                  <Badge tone="neutral">{record.sourceType}</Badge>
                  <Badge tone={record.verification === 'verified-structure' ? 'ok' : 'warn'}>{record.verification}</Badge>
                </header>
                <p className="fr-muted">{formatCitation({ ...record, id: record.id, origin: 'user', retrievedAt: record.retrievedAt, fullText: record.fullText, year: null } as never)}</p>
                {record.observation ? <p>{record.observation}</p> : null}
                <p className="fr-muted">
                  {record.accessNote} {record.verificationNote}
                </p>
                {record.hypothesisIds.length > 0 ? (
                  <div className="fr-chiprow">
                    {record.hypothesisIds.map((id) => {
                      const index = project.hypotheses.findIndex((hypothesis) => hypothesis.id === id);
                      return (
                        <button
                          key={id}
                          type="button"
                          className="fr-btn fr-btn--ghost"
                          onClick={() => update((current) => setEvidenceLink(current, record.id, id, false))}
                          aria-label={`${t('frRemove')} link ${index >= 0 ? `H${index + 1}` : id}`}
                        >
                          H{index + 1} ×
                        </button>
                      );
                    })}
                  </div>
                ) : null}
                <div className="fr-chiprow">
                  {project.hypotheses
                    .filter((hypothesis) => !record.hypothesisIds.includes(hypothesis.id))
                    .map((hypothesis, index) => (
                      <button
                        key={hypothesis.id}
                        type="button"
                        className="fr-btn fr-btn--soft"
                        onClick={() => update((current) => setEvidenceLink(current, record.id, hypothesis.id, true))}
                      >
                        {t('frLinkTo')} H{index + 1}
                      </button>
                    ))}
                  <button
                    type="button"
                    className="fr-btn fr-btn--ghost"
                    onClick={() => update((current) => removeEvidence(current, record.id))}
                  >
                    {t('frRemove')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="fr-block">
        <h4>{t('frStance')}</h4>
        {project.hypotheses.length === 0 ? (
          <Empty>{t('frNewHypothesis')}</Empty>
        ) : (
          <ul className="fr-balance">
            {project.hypotheses.map((hypothesis, index) => {
              const balance = evidenceBalance(project.evidence, hypothesis.id);
              return (
                <li key={hypothesis.id}>
                  <strong>H{index + 1}</strong> {balance.statement}
                  {balance.indeterminate ? <Badge tone="warn">indeterminate</Badge> : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
