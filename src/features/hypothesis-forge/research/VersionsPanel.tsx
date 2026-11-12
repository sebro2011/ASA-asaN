/**
 * Versions and provenance.
 *
 * Saving a version is explicit, restoring one is explicit, and both say what
 * happened in plain words. A restore never recalculates: the stored snapshot is
 * shown as it was, and the provenance block states which dataset hashes were
 * pinned at the time — and that this session has not re-checked them against the
 * source, because doing so would require a live request this panel does not make.
 */

import { useState } from 'react';
import { summariseProject, type ResearchProject } from '../../../lib/forge/research/project';
import { Badge, Empty, Labeled, TextInput } from './controls';

type Translate = (key: string) => string;

export function VersionsPanel({
  project,
  commit,
  restore,
  t,
}: {
  project: ResearchProject;
  commit: (label: string) => void;
  restore: (versionId: string) => string;
  t: Translate;
}) {
  const [label, setLabel] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const summary = summariseProject(project);

  return (
    <div className="fr-panel">
      <section className="fr-block">
        <h4>{t('frCommit')}</h4>
        <div className="fr-actions">
          <Labeled label={t('frCommitLabel')}>
            <TextInput value={label} onChange={setLabel} placeholder="Before changing the method" />
          </Labeled>
          <button
            type="button"
            className="fr-btn fr-btn--primary"
            onClick={() => {
              commit(label);
              setLabel('');
              setNotice('A version was saved with the current content hash. Autosave alone would not have created one.');
            }}
          >
            {t('frCommit')}
          </button>
        </div>
        {notice ? (
          <p className="fr-feedback" role="status">
            {notice}
          </p>
        ) : null}
      </section>

      <section className="fr-block">
        <h4>{t('frVersions')}</h4>
        {project.versions.length === 0 ? (
          <Empty>{t('frNoVersions')}</Empty>
        ) : (
          <ol className="fr-versions">
            {[...project.versions].reverse().map((version) => (
              <li key={version.id} className="fr-versions__item">
                <header>
                  <strong>{version.label}</strong>
                  <span className="fr-mono">{version.contentHash}</span>
                  <span className="fr-muted">{new Date(version.createdAt).toLocaleString()}</span>
                </header>
                <p className="fr-muted">
                  {t('frChanged')}: {version.changed.length > 0 ? version.changed.join(', ') : '—'}
                </p>
                <button
                  type="button"
                  className="fr-btn fr-btn--soft"
                  onClick={() => setNotice(restore(version.id))}
                >
                  {t('frRestoreVersion')}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section className="fr-block">
        <h4>{t('frDatasetSnapshots')}</h4>
        {project.datasets.length === 0 ? (
          <Empty>{t('frNoDatasets')}</Empty>
        ) : (
          <>
            <ul className="fr-limits">
              {project.datasets.map((snapshot) => (
                <li key={snapshot.datasetId}>
                  <strong>{snapshot.title}</strong> · {snapshot.version} · <span className="fr-mono">{snapshot.payloadHash}</span> ·{' '}
                  {snapshot.rowCount} rows
                </li>
              ))}
            </ul>
            <p className="fr-hint">
              These hashes are pinned to the run. This workspace does not query the source, so it cannot tell you whether the
              dataset changed since; that check belongs to an investigation run and is reported as drift, never absorbed.
            </p>
          </>
        )}
      </section>

      <section className="fr-block">
        <h4>{t('frGaps')}</h4>
        <div className="fr-chiprow">
          <Badge tone={summary.versionCount > 0 ? 'ok' : 'warn'}>{summary.versionCount} versions</Badge>
          <Badge tone={summary.datasetCount > 0 ? 'ok' : 'warn'}>{summary.datasetCount} dataset snapshots</Badge>
          <Badge tone={summary.evidenceCount > 0 ? 'ok' : 'warn'}>{summary.evidenceCount} evidence records</Badge>
          <Badge tone={summary.hypothesisCount > 0 ? 'ok' : 'warn'}>{summary.hypothesisCount} hypotheses</Badge>
        </div>
      </section>
    </div>
  );
}
