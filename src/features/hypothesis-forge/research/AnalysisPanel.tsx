/**
 * Analysis and conclusions.
 *
 * The Computational Laboratory is *embedded*, not re-implemented: when the
 * project is linked to a stored investigation, the real `ScienceLab` runs on the
 * series that investigation retrieved. When there is nothing to compute, the
 * panel says so instead of showing an empty lab.
 *
 * Conclusions are recorded, not inferred: support is chosen by the researcher,
 * caveats are required to be written down, and "independently reproduced" starts
 * false and can only be set by a person asserting it.
 */

import { useMemo, useState } from 'react';
import { ScienceLab } from '../ScienceLab';
import { listInvestigations } from '../../../lib/forge/memory';
import {
  linkInvestigation,
  newId,
  removeConclusion,
  unlinkInvestigation,
  upsertConclusion,
  type ResearchProject,
} from '../../../lib/forge/research/project';
import { Badge, Empty, Labeled, Select, StringListEditor, TextArea, TextInput } from './controls';

type Translate = (key: string) => string;

export function AnalysisPanel({
  project,
  update,
  t,
}: {
  project: ResearchProject;
  update: (mutate: (project: ResearchProject) => ResearchProject) => void;
  t: Translate;
}) {
  const [selectedInvestigation, setSelectedInvestigation] = useState<string | null>(project.investigationIds[0] ?? null);
  const [hypothesisId, setHypothesisId] = useState(project.hypotheses[0]?.id ?? '');
  const [statement, setStatement] = useState('');
  const [support, setSupport] = useState<'supported' | 'not-supported' | 'inconclusive'>('inconclusive');
  const [caveats, setCaveats] = useState<string[]>([]);

  // Reading the journal is a storage read, not a network call.
  const stored = useMemo(() => {
    try {
      return listInvestigations();
    } catch {
      return [];
    }
  }, []);

  const linked = project.investigationIds
    .map((id) => stored.find((entry) => entry.id === id))
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));

  const activeInvestigation =
    linked.find((entry) => entry.id === selectedInvestigation) ?? linked[0] ?? null;

  const seriesList = activeInvestigation
    ? activeInvestigation.investigation.datasets.flatMap((dataset) => dataset.series)
    : [];

  return (
    <div className="fr-panel">
      <section className="fr-block">
        <h4>{t('frAttachInvestigation')}</h4>
        {stored.length === 0 ? (
          <Empty>{t('frNoInvestigations')}</Empty>
        ) : (
          <div className="fr-actions">
            <Labeled label={t('frAttachInvestigation')}>
              <Select
                value={project.investigationIds[0] ?? ''}
                onChange={(id) => {
                  if (!id) return;
                  update((current) => linkInvestigation(current, id));
                  setSelectedInvestigation(id);
                }}
                options={[
                  { value: '', label: '—' },
                  ...stored.map((entry) => ({ value: entry.id, label: entry.question.slice(0, 80) })),
                ]}
              />
            </Labeled>
            {linked.length > 0 ? (
              <div className="fr-chiprow">
                {linked.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="fr-btn fr-btn--ghost"
                    onClick={() => update((current) => unlinkInvestigation(current, entry.id))}
                  >
                    {t('frRemove')}: {entry.question.slice(0, 40)}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
        <p className="fr-hint">{t('frAnalysisHint')}</p>
      </section>

      {seriesList.length > 0 ? (
        <section className="fr-block">
          <h4>{t('frAnalysis')}</h4>
          <ScienceLab seriesList={seriesList} />
        </section>
      ) : linked.length > 0 ? (
        <section className="fr-block">
          <Empty>The linked investigation recorded no usable series, so there is nothing to compute.</Empty>
        </section>
      ) : null}

      <section className="fr-block">
        <h4>{t('frConclusions')}</h4>
        {project.conclusions.length === 0 ? <Empty>{t('frAddConclusion')}</Empty> : null}
        <ul className="fr-conclusions">
          {project.conclusions.map((conclusion) => (
            <li key={conclusion.id}>
              <header>
                <Badge tone={conclusion.support === 'supported' ? 'ok' : conclusion.support === 'not-supported' ? 'bad' : 'warn'}>
                  {conclusion.support}
                </Badge>
                {conclusion.independentlyReproduced ? <Badge tone="ok">{t('frReproduced')}</Badge> : null}
              </header>
              <p>{conclusion.statement}</p>
              {conclusion.caveats.length > 0 ? (
                <ul className="fr-limits">
                  {conclusion.caveats.map((caveat) => (
                    <li key={caveat}>{caveat}</li>
                  ))}
                </ul>
              ) : null}
              <div className="fr-chiprow">
                <label className="fr-check">
                  <input
                    type="checkbox"
                    checked={conclusion.independentlyReproduced}
                    onChange={(event) =>
                      update((current) =>
                        upsertConclusion(current, { ...conclusion, independentlyReproduced: event.target.checked }),
                      )
                    }
                  />
                  <span>{t('frReproduced')}</span>
                </label>
                <button
                  type="button"
                  className="fr-btn fr-btn--ghost"
                  onClick={() => update((current) => removeConclusion(current, conclusion.id))}
                >
                  {t('frRemove')}
                </button>
              </div>
            </li>
          ))}
        </ul>

        <div className="fr-card">
          <Labeled label={t('frConclusions')} wide>
            <TextArea rows={2} value={statement} onChange={setStatement} />
          </Labeled>
          <div className="fr-grid fr-grid--two">
            <Labeled label={t('frHypotheses')}>
              <Select
                value={hypothesisId}
                onChange={setHypothesisId}
                options={project.hypotheses.map((hypothesis, index) => ({ value: hypothesis.id, label: `H${index + 1}` }))}
              />
            </Labeled>
            <Labeled label={t('frStance')}>
              <Select
                value={support}
                onChange={setSupport}
                options={[
                  { value: 'supported', label: 'supported' },
                  { value: 'not-supported', label: 'not supported' },
                  { value: 'inconclusive', label: 'inconclusive' },
                ]}
              />
            </Labeled>
          </div>
          <Labeled label={t('frFLimitations')} wide>
            <StringListEditor items={caveats} addLabel={t('frAdd')} removeLabel={t('frRemove')} onChange={setCaveats} />
          </Labeled>
          <button
            type="button"
            className="fr-btn fr-btn--primary"
            onClick={() => {
              if (!statement.trim() || !hypothesisId) return;
              update((current) =>
                upsertConclusion(current, {
                  id: newId('con'),
                  statement: statement.trim(),
                  hypothesisId,
                  support,
                  caveats: caveats.filter((caveat) => caveat.trim().length > 0),
                  createdAt: new Date().toISOString(),
                  independentlyReproduced: false,
                }),
              );
              setStatement('');
              setCaveats([]);
            }}
          >
            {t('frAddConclusion')}
          </button>
        </div>
      </section>

      {project.simulations.length > 0 ? (
        <section className="fr-block">
          <h4>{t('frAnalysis')}</h4>
          <ul className="fr-limits">
            {project.simulations.map((simulation) => (
              <li key={simulation.id}>
                <strong>{simulation.modelId}</strong> · engine {simulation.engineVersion} · validation{' '}
                {simulation.validationPassed === null ? 'not available' : simulation.validationPassed ? 'passed' : 'failed'}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
