/**
 * Project overview: the parts of a research programme that are not hypotheses —
 * questions, objectives, variables, assumptions, pre-registered methods, pinned
 * dataset snapshots and the project's own gap list.
 *
 * Every editor writes through the project helpers (never directly into state),
 * so a change is a normalised project that autosave can persist unchanged.
 */

import { DISCIPLINES, newId, summariseProject, type ResearchProject } from '../../../lib/forge/research/project';
import { Badge, Labeled, Select, StringListEditor, TextArea, TextInput, Empty } from './controls';

type Translate = (key: string) => string;

export function ProjectOverviewPanel({
  project,
  update,
  t,
}: {
  project: ResearchProject;
  update: (mutate: (project: ResearchProject) => ResearchProject) => void;
  t: Translate;
}) {
  const summary = summariseProject(project);

  return (
    <div className="fr-panel">
      <div className="fr-grid fr-grid--two">
        <Labeled label={t('frProjectName')}>
          <TextInput value={project.title} onChange={(title) => update((current) => ({ ...current, title }))} />
        </Labeled>
        <Labeled label={t('frDiscipline')}>
          <Select
            value={project.discipline}
            onChange={(discipline) => update((current) => ({ ...current, discipline }))}
            options={DISCIPLINES.map((discipline) => ({ value: discipline, label: discipline }))}
          />
        </Labeled>
        <Labeled label={t('frTitle')} wide>
          <TextArea value={project.description} rows={2} onChange={(description) => update((current) => ({ ...current, description }))} />
        </Labeled>
      </div>

      <section className="fr-block">
        <h4>{t('frQuestions')}</h4>
        <StringListEditor
          items={project.questions}
          addLabel={t('frAdd')}
          removeLabel={t('frRemove')}
          multiline
          onChange={(questions) => update((current) => ({ ...current, questions }))}
        />
        <h4>{t('frObjectives')}</h4>
        <StringListEditor
          items={project.objectives}
          addLabel={t('frAdd')}
          removeLabel={t('frRemove')}
          onChange={(objectives) => update((current) => ({ ...current, objectives }))}
        />
      </section>

      <section className="fr-block">
        <h4>{t('frVariables')}</h4>
        <div className="fr-tablewrap">
          <table className="fr-table">
            <thead>
              <tr>
                <th scope="col">{t('frProjectName')}</th>
                <th scope="col">{t('frRole')}</th>
                <th scope="col">{t('frUnit')}</th>
                <th scope="col">{t('frOperationalisation')}</th>
                <th scope="col" aria-label={t('frRemove')} />
              </tr>
            </thead>
            <tbody>
              {project.variables.map((variable) => (
                <tr key={variable.id}>
                  <td>
                    <TextInput
                      value={variable.name}
                      onChange={(name) =>
                        update((current) => ({
                          ...current,
                          variables: current.variables.map((entry) => (entry.id === variable.id ? { ...entry, name } : entry)),
                        }))
                      }
                    />
                  </td>
                  <td>
                    <Select
                      value={variable.role}
                      onChange={(role) =>
                        update((current) => ({
                          ...current,
                          variables: current.variables.map((entry) => (entry.id === variable.id ? { ...entry, role } : entry)),
                        }))
                      }
                      options={[
                        { value: 'independent', label: 'independent' },
                        { value: 'dependent', label: 'dependent' },
                        { value: 'control', label: 'control' },
                        { value: 'mediator', label: 'mediator' },
                        { value: 'confounder', label: 'confounder' },
                      ]}
                    />
                  </td>
                  <td>
                    <TextInput
                      value={variable.unit}
                      onChange={(unit) =>
                        update((current) => ({
                          ...current,
                          variables: current.variables.map((entry) => (entry.id === variable.id ? { ...entry, unit } : entry)),
                        }))
                      }
                    />
                  </td>
                  <td>
                    <TextInput
                      value={variable.operationalisation}
                      onChange={(operationalisation) =>
                        update((current) => ({
                          ...current,
                          variables: current.variables.map((entry) =>
                            entry.id === variable.id ? { ...entry, operationalisation } : entry,
                          ),
                        }))
                      }
                    />
                  </td>
                  <td>
                    <button
                      type="button"
                      className="fr-btn fr-btn--ghost"
                      aria-label={`${t('frRemove')} ${variable.name}`}
                      onClick={() =>
                        update((current) => ({
                          ...current,
                          variables: current.variables.filter((entry) => entry.id !== variable.id),
                        }))
                      }
                    >
                      ×
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <button
          type="button"
          className="fr-btn fr-btn--soft"
          onClick={() =>
            update((current) => ({
              ...current,
              variables: [
                ...current.variables,
                { id: newId('var'), name: '', role: 'independent', unit: '', operationalisation: '' },
              ],
            }))
          }
        >
          {t('frAdd')}
        </button>
      </section>

      <section className="fr-block">
        <h4>{t('frAssumptions')}</h4>
        {project.assumptions.length === 0 ? <Empty>{t('frNoEvidence')}</Empty> : null}
        {project.assumptions.map((assumption) => (
          <div className="fr-card" key={assumption.id}>
            <Labeled label={t('frAssumptions')} wide>
              <TextArea
                rows={2}
                value={assumption.statement}
                onChange={(statement) =>
                  update((current) => ({
                    ...current,
                    assumptions: current.assumptions.map((entry) =>
                      entry.id === assumption.id ? { ...entry, statement } : entry,
                    ),
                  }))
                }
              />
            </Labeled>
            <div className="fr-grid fr-grid--two">
              <Labeled label={t('frIfFalse')}>
                <TextInput
                  value={assumption.ifFalse}
                  onChange={(ifFalse) =>
                    update((current) => ({
                      ...current,
                      assumptions: current.assumptions.map((entry) =>
                        entry.id === assumption.id ? { ...entry, ifFalse } : entry,
                      ),
                    }))
                  }
                />
              </Labeled>
              <Labeled label={t('frStatus')}>
                <Select
                  value={assumption.status}
                  onChange={(status) =>
                    update((current) => ({
                      ...current,
                      assumptions: current.assumptions.map((entry) =>
                        entry.id === assumption.id ? { ...entry, status } : entry,
                      ),
                    }))
                  }
                  options={[
                    { value: 'untested', label: 'untested' },
                    { value: 'supported', label: 'supported' },
                    { value: 'challenged', label: 'challenged' },
                    { value: 'violated', label: 'violated' },
                  ]}
                />
              </Labeled>
            </div>
            <button
              type="button"
              className="fr-btn fr-btn--ghost"
              onClick={() =>
                update((current) => ({
                  ...current,
                  assumptions: current.assumptions.filter((entry) => entry.id !== assumption.id),
                }))
              }
            >
              {t('frRemove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="fr-btn fr-btn--soft"
          onClick={() =>
            update((current) => ({
              ...current,
              assumptions: [...current.assumptions, { id: newId('asm'), statement: '', ifFalse: '', status: 'untested' }],
            }))
          }
        >
          {t('frAdd')}
        </button>
      </section>

      <section className="fr-block">
        <h4>{t('frMethods')}</h4>
        {project.methods.map((method) => (
          <div className="fr-card" key={method.id}>
            <div className="fr-grid fr-grid--two">
              <Labeled label={t('frMethods')}>
                <TextInput
                  value={method.name}
                  onChange={(name) =>
                    update((current) => ({
                      ...current,
                      methods: current.methods.map((entry) => (entry.id === method.id ? { ...entry, name } : entry)),
                    }))
                  }
                />
              </Labeled>
              <Labeled label={t('frDecisionRule')}>
                <TextInput
                  value={method.decisionRule}
                  onChange={(decisionRule) =>
                    update((current) => ({
                      ...current,
                      methods: current.methods.map((entry) =>
                        entry.id === method.id ? { ...entry, decisionRule } : entry,
                      ),
                    }))
                  }
                />
              </Labeled>
            </div>
            <label className="fr-check">
              <input
                type="checkbox"
                checked={method.preregistered}
                onChange={(event) =>
                  update((current) => ({
                    ...current,
                    methods: current.methods.map((entry) =>
                      entry.id === method.id ? { ...entry, preregistered: event.target.checked } : entry,
                    ),
                  }))
                }
              />
              <span>{t('frPreregistered')}</span>
            </label>
            <button
              type="button"
              className="fr-btn fr-btn--ghost"
              onClick={() =>
                update((current) => ({ ...current, methods: current.methods.filter((entry) => entry.id !== method.id) }))
              }
            >
              {t('frRemove')}
            </button>
          </div>
        ))}
        <button
          type="button"
          className="fr-btn fr-btn--soft"
          onClick={() =>
            update((current) => ({
              ...current,
              methods: [
                ...current.methods,
                { id: newId('mth'), name: '', kind: 'descriptive', variables: [], decisionRule: '', preregistered: false },
              ],
            }))
          }
        >
          {t('frAdd')}
        </button>
      </section>

      <section className="fr-block">
        <h4>{t('frDatasetSnapshots')}</h4>
        {project.datasets.length === 0 ? (
          <Empty>{t('frNoDatasets')}</Empty>
        ) : (
          <div className="fr-tablewrap">
            <table className="fr-table">
              <thead>
                <tr>
                  <th scope="col">Dataset</th>
                  <th scope="col">{t('frVersionLabel')}</th>
                  <th scope="col">{t('frRows')}</th>
                  <th scope="col">{t('frPayloadHash')}</th>
                  <th scope="col">{t('frQuery')}</th>
                </tr>
              </thead>
              <tbody>
                {project.datasets.map((snapshot) => (
                  <tr key={snapshot.datasetId}>
                    <td>
                      <strong>{snapshot.title}</strong>
                      <div className="fr-muted">{snapshot.organisation}</div>
                    </td>
                    <td className="fr-mono">{snapshot.version}</td>
                    <td className="fr-mono">{snapshot.rowCount}</td>
                    <td className="fr-mono">{snapshot.payloadHash}</td>
                    <td className="fr-mono fr-wrap">{snapshot.query}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="fr-block">
        <h4>{t('frGaps')}</h4>
        {summary.gaps.length === 0 ? (
          <Badge tone="ok">No structural gap detected — this is not a claim that the design is sound.</Badge>
        ) : (
          <ul className="fr-limits">
            {summary.gaps.map((gap) => (
              <li key={gap}>{gap}</li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
