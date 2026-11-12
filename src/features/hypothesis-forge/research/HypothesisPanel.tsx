/**
 * Hypothesis workspace: create, edit all thirteen fields, compare, and move
 * through the lifecycle.
 *
 * The lifecycle buttons are driven by `canTransition`, so the UI cannot offer a
 * transition the model would refuse, and a refused attempt shows the exact
 * missing fields rather than a generic error. A hypothesis is never labelled a
 * discovery here; the disclosure sentence comes from the model, not the markup.
 */

import { useMemo, useState } from 'react';
import {
  compareHypotheses,
  createHypothesis,
  editFields,
  fromGenerated,
  nextStates,
  lifecycleDisclosure,
  missingFields,
  transition,
  canTransition,
  type HypothesisLifecycle,
  type ResearchHypothesisFields,
} from '../../../lib/forge/research/hypothesis';
import { removeHypothesis, upsertHypothesis, type ResearchProject } from '../../../lib/forge/research/project';
import { Badge, Empty, Labeled, RowsEditor, StringListEditor, TextArea, TextInput } from './controls';

type Translate = (key: string) => string;

const TONE: Record<HypothesisLifecycle, 'neutral' | 'warn' | 'ok' | 'bad'> = {
  draft: 'neutral',
  'needs-evidence': 'warn',
  testable: 'neutral',
  'under-evaluation': 'warn',
  supported: 'ok',
  'not-supported': 'bad',
  inconclusive: 'warn',
  archived: 'neutral',
};

export function HypothesisPanel({
  project,
  update,
  t,
  selectedId: controlledId,
  onSelect,
}: {
  project: ResearchProject;
  update: (mutate: (project: ResearchProject) => ResearchProject) => void;
  t: Translate;
  /** Lifted so the assistant and evidence panels see the same selection. */
  selectedId?: string | null;
  onSelect?: (id: string | null) => void;
}) {
  const [internalId, setInternalId] = useState<string | null>(project.hypotheses[0]?.id ?? null);
  const selectedId = controlledId !== undefined ? controlledId : internalId;
  const setSelectedId = (id: string | null) => {
    setInternalId(id);
    onSelect?.(id);
  };
  const [comparing, setComparing] = useState(false);
  const [refusal, setRefusal] = useState<string | null>(null);

  const selected = useMemo(
    () => project.hypotheses.find((hypothesis) => hypothesis.id === selectedId) ?? project.hypotheses[0] ?? null,
    [project.hypotheses, selectedId],
  );

  const create = () => {
    const hypothesis = createHypothesis({
      projectId: project.id,
      // Pre-fill nothing: the researcher writes the claim, the Forge does not.
      lifecycle: 'draft',
    });
    update((current) => upsertHypothesis(current, hypothesis));
    setSelectedId(hypothesis.id);
    setRefusal(null);
  };

  const patch = (fields: Partial<ResearchHypothesisFields>, note = 'Fields edited.') => {
    if (!selected) return;
    const next = editFields(selected, fields, note);
    update((current) => upsertHypothesis(current, next));
  };

  const advance = (target: HypothesisLifecycle) => {
    if (!selected) return;
    const result = transition(selected, target, `Moved to ${target} in the workspace.`);
    if (!result.check.allowed) {
      setRefusal(result.check.reason);
      return;
    }
    setRefusal(null);
    update((current) => upsertHypothesis(current, result.hypothesis));
  };

  const rows = project.hypotheses.map((hypothesis) => ({
    id: hypothesis.id,
    statement: hypothesis.statement,
    lifecycle: hypothesis.lifecycle,
    missing: missingFields(hypothesis).length,
  }));

  return (
    <div className="fr-panel fr-split">
      <div className="fr-split__aside">
        <button type="button" className="fr-btn fr-btn--primary" onClick={create}>
          {t('frNewHypothesis')}
        </button>
        <ul className="fr-hypothesis-list">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                className={`fr-hypothesis-list__item${selected?.id === row.id ? ' is-active' : ''}`}
                aria-current={selected?.id === row.id ? 'true' : undefined}
                onClick={() => setSelectedId(row.id)}
              >
                <span className="fr-hypothesis-list__text">{row.statement || '(no statement yet)'}</span>
                <Badge tone={TONE[row.lifecycle]}>{row.lifecycle}</Badge>
                <span className="fr-muted">
                  {row.missing === 0 ? '13/13 fields' : `${13 - row.missing}/13 fields`}
                </span>
              </button>
            </li>
          ))}
        </ul>
        {project.hypotheses.length > 1 ? (
          <button type="button" className="fr-btn fr-btn--soft" onClick={() => setComparing((value) => !value)} aria-expanded={comparing}>
            {t('frCompare')}
          </button>
        ) : null}
      </div>

      <div className="fr-split__main">
        {!selected ? (
          <Empty>{t('frNoSelection')}</Empty>
        ) : (
          <>
            <header className="fr-panel__head">
              <div>
                <Badge tone={TONE[selected.lifecycle]}>{selected.lifecycle}</Badge>
                <h4>{selected.statement || t('frNewHypothesis')}</h4>
              </div>
              <button
                type="button"
                className="fr-btn fr-btn--ghost"
                onClick={() => {
                  update((current) => removeHypothesis(current, selected.id));
                  setSelectedId(null);
                }}
              >
                {t('frRemove')}
              </button>
            </header>

            <p className="fr-disclosure">{lifecycleDisclosure(selected)}</p>

            <section className="fr-block">
              <h4>{t('frLifecycle')}</h4>
              <div className="fr-chiprow">
                {/*
                  Every reachable state is shown, including the ones the content
                  gates currently block: hiding them would leave the researcher
                  guessing why a promotion is unavailable. A blocked button stays
                  focusable and explains itself when pressed.
                */}
                {nextStates(selected).map((state) => {
                  const check = canTransition(selected, state);
                  return (
                    <button
                      key={state}
                      type="button"
                      className={`fr-btn fr-btn--soft${check.allowed ? '' : ' is-blocked'}`}
                      aria-disabled={check.allowed ? undefined : 'true'}
                      title={check.allowed ? undefined : check.reason}
                      onClick={() => advance(state)}
                    >
                      {t('frAdvanceTo')} {state}
                    </button>
                  );
                })}
              </div>
              {refusal ? (
                <p className="fr-refusal" role="status">
                  {t('frBlocked')}: {refusal}
                </p>
              ) : null}
            </section>

            <Labeled label={t('frFStatement')} wide>
              <TextArea rows={2} value={selected.statement} onChange={(statement) => patch({ statement })} />
            </Labeled>
            <div className="fr-grid fr-grid--two">
              <Labeled label={t('frFRationale')}>
                <TextArea rows={2} value={selected.rationale} onChange={(rationale) => patch({ rationale })} />
              </Labeled>
              <Labeled label={t('frFTheory')}>
                <TextArea rows={2} value={selected.theory} onChange={(theory) => patch({ theory })} />
              </Labeled>
            </div>

            <div className="fr-grid fr-grid--two">
              <Labeled label={t('frFIndependent')}>
                <StringListEditor
                  items={selected.independentVariables}
                  addLabel={t('frAdd')}
                  removeLabel={t('frRemove')}
                  onChange={(independentVariables) => patch({ independentVariables })}
                />
              </Labeled>
              <Labeled label={t('frFDependent')}>
                <StringListEditor
                  items={selected.dependentVariables}
                  addLabel={t('frAdd')}
                  removeLabel={t('frRemove')}
                  onChange={(dependentVariables) => patch({ dependentVariables })}
                />
              </Labeled>
              <Labeled label={t('frFControls')}>
                <StringListEditor
                  items={selected.controls}
                  addLabel={t('frAdd')}
                  removeLabel={t('frRemove')}
                  onChange={(controls) => patch({ controls })}
                />
              </Labeled>
              <Labeled label={t('frFAssumptions')}>
                <StringListEditor
                  items={selected.assumptions}
                  addLabel={t('frAdd')}
                  removeLabel={t('frRemove')}
                  onChange={(assumptions) => patch({ assumptions })}
                />
              </Labeled>
            </div>

            <Labeled label={t('frFPredictions')} wide>
              <RowsEditor
                rows={selected.predictions.map((prediction) => ({
                  prediction: prediction.prediction,
                  expectedObservation: prediction.expectedObservation,
                  unit: prediction.unit,
                }))}
                fields={[
                  { key: 'prediction', label: t('frFPredictions') },
                  { key: 'expectedObservation', label: t('frObservation') },
                  { key: 'unit', label: t('frUnit') },
                ]}
                addLabel={t('frAdd')}
                removeLabel={t('frRemove')}
                onChange={(predictions) =>
                  patch({
                    predictions: predictions.map((entry) => ({
                      prediction: entry.prediction ?? '',
                      expectedObservation: entry.expectedObservation ?? '',
                      unit: entry.unit ?? '',
                    })),
                  })
                }
              />
            </Labeled>

            <Labeled label={t('frFMethodology')} wide>
              <TextArea rows={3} value={selected.methodology} onChange={(methodology) => patch({ methodology })} />
            </Labeled>

            <Labeled label={t('frFDatasets')} wide>
              <RowsEditor
                rows={selected.datasets.map((dataset) => ({ datasetId: dataset.datasetId, variable: dataset.variable }))}
                fields={[
                  { key: 'datasetId', label: 'datasetId' },
                  { key: 'variable', label: t('frVariables') },
                ]}
                addLabel={t('frAdd')}
                removeLabel={t('frRemove')}
                onChange={(datasets) =>
                  patch({
                    datasets: datasets.map((entry) => ({
                      datasetId: entry.datasetId ?? '',
                      variable: entry.variable ?? '',
                    })),
                  })
                }
              />
            </Labeled>

            <div className="fr-grid fr-grid--three">
              <Labeled label={t('frFLimitations')}>
                <StringListEditor
                  items={selected.limitations}
                  addLabel={t('frAdd')}
                  removeLabel={t('frRemove')}
                  onChange={(limitations) => patch({ limitations })}
                />
              </Labeled>
              <Labeled label={t('frFAlternatives')}>
                <StringListEditor
                  items={selected.alternativeExplanations}
                  addLabel={t('frAdd')}
                  removeLabel={t('frRemove')}
                  onChange={(alternativeExplanations) => patch({ alternativeExplanations })}
                />
              </Labeled>
              <Labeled label={t('frFFalsification')}>
                <StringListEditor
                  items={selected.falsificationConditions}
                  addLabel={t('frAdd')}
                  removeLabel={t('frRemove')}
                  onChange={(falsificationConditions) => patch({ falsificationConditions })}
                />
              </Labeled>
            </div>

            {comparing && project.hypotheses.length > 1 ? (
              <section className="fr-block">
                <h4>{t('frCompare')}</h4>
                <p className="fr-hint">{t('frCompareHint')}</p>
                <div className="fr-tablewrap">
                  <table className="fr-table fr-table--compare">
                    <thead>
                      <tr>
                        <th scope="col">Field</th>
                        {project.hypotheses.map((hypothesis, index) => (
                          <th scope="col" key={hypothesis.id}>
                            H{index + 1}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {compareHypotheses(project.hypotheses).map((row) => (
                        <tr key={row.field} className={row.same ? 'is-same' : 'is-different'}>
                          <th scope="row">{row.field}</th>
                          {row.values.map((value, index) => (
                            <td key={index}>{value || '—'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ) : null}

            {selected.sourceHypothesisId ? (
              <p className="fr-muted">
                Imported from engine hypothesis {selected.sourceHypothesisId}; fields the engine does not produce were left
                empty on purpose.
              </p>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}

/** Exposed for the workspace: create a research hypothesis from an engine one. */
export function importGeneratedHypothesis(
  project: ResearchProject,
  generated: Parameters<typeof fromGenerated>[0]['generated'],
) {
  return fromGenerated({ projectId: project.id, generated });
}

export type { ResearchHypothesisFields };
