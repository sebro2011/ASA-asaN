/**
 * The five schema-driven astronomy modules.
 *
 * Each one is a real, working record tool backed by the on-device store: create,
 * edit, delete, compare rows and hand a record to NOVA for an explanation. The
 * only thing they do not do is invent data.
 */
import { useTranslation } from 'react-i18next';
import ModuleSurface, { type FieldSpec } from './ModuleSurface';
import { moonPhase, toDateInputValue } from './astronomy';
import type { ModuleRecord } from './records';

/** Moon phase for a stored session date — computed, never looked up. */
function MoonChip({ value }: { value: string | undefined }) {
  const { t } = useTranslation();
  if (!value) return null;
  const phase = moonPhase(value);
  if (!phase) return null;
  const percent = Math.round(phase.illumination * 100);
  return (
    <p className="nova-record__moon">
      <span className="nova-chip">{t('wsMoonPhase')}</span>
      <span>
        {t(phase.phaseKey)} · {t('wsMoonIllumination', { percent })}
      </span>
    </p>
  );
}

const STATUS: FieldSpec['options'] = [
  { value: 'planned', labelKey: 'wsOptPlanned' },
  { value: 'active', labelKey: 'wsOptActive' },
  { value: 'complete', labelKey: 'wsOptComplete' },
];

const PRIORITY: FieldSpec['options'] = [
  { value: 'high', labelKey: 'wsOptHigh' },
  { value: 'medium', labelKey: 'wsOptMedium' },
  { value: 'low', labelKey: 'wsOptLow' },
];

const SEEING: FieldSpec['options'] = [
  { value: 'excellent', labelKey: 'wsOptExcellent' },
  { value: 'good', labelKey: 'wsOptGood' },
  { value: 'fair', labelKey: 'wsOptFair' },
  { value: 'poor', labelKey: 'wsOptPoor' },
];

export function MissionsSurface() {
  return (
    <ModuleSurface
      moduleId="missions"
      titleKey="wsMenuProjects"
      subtitleKey="wsAreaProjectsDesc"
      noteKey="wsMissionsNote"
      primaryKey="name"
      metaKeys={['agency', 'target', 'launch', 'status']}
      fields={[
        { key: 'name', labelKey: 'wsFieldMissionName', type: 'text', required: true, maxLength: 160 },
        { key: 'agency', labelKey: 'wsFieldAgency', type: 'text', maxLength: 80 },
        { key: 'target', labelKey: 'wsFieldTarget', type: 'text', maxLength: 120 },
        { key: 'launch', labelKey: 'wsFieldLaunch', type: 'date' },
        { key: 'status', labelKey: 'wsFieldStatus', type: 'select', options: STATUS },
        { key: 'objectives', labelKey: 'wsFieldObjectives', type: 'textarea', maxLength: 4000 },
      ]}
    />
  );
}

export function ObservationLogsSurface() {
  return (
    <ModuleSurface
      moduleId="logs"
      titleKey="wsMenuDocuments"
      subtitleKey="wsAreaDocumentsDesc"
      noteKey="wsLogsNote"
      primaryKey="target"
      metaKeys={['date', 'instrument', 'seeing']}
      fields={[
        { key: 'target', labelKey: 'wsFieldTarget', type: 'text', required: true, maxLength: 120 },
        { key: 'date', labelKey: 'wsFieldDate', type: 'date', required: true },
        { key: 'instrument', labelKey: 'wsFieldInstrument', type: 'text', maxLength: 120 },
        { key: 'seeing', labelKey: 'wsFieldSeeing', type: 'select', options: SEEING },
        { key: 'notes', labelKey: 'wsFieldNotes', type: 'textarea', maxLength: 8000 },
      ]}
    />
  );
}

export function ResearchJournalSurface() {
  return (
    <ModuleSurface
      moduleId="journal"
      titleKey="wsMenuWriting"
      subtitleKey="wsAreaWritingDesc"
      noteKey="wsJournalNote"
      primaryKey="title"
      metaKeys={['question']}
      linesKey="sources"
      fields={[
        { key: 'title', labelKey: 'wsFieldTitle', type: 'text', required: true, maxLength: 160 },
        { key: 'question', labelKey: 'wsFieldQuestion', type: 'text', maxLength: 300 },
        { key: 'body', labelKey: 'wsFieldBody', type: 'textarea', maxLength: 12_000 },
        { key: 'sources', labelKey: 'wsFieldSources', type: 'lines', maxLength: 2000 },
      ]}
    />
  );
}

export function DeepSkyResearchSurface() {
  return (
    <ModuleSurface
      moduleId="research"
      titleKey="wsMenuResearch"
      subtitleKey="wsAreaResearchDesc"
      noteKey="wsResearchNote"
      primaryKey="question"
      metaKeys={['instruments']}
      linesKey="targets"
      fields={[
        { key: 'question', labelKey: 'wsFieldQuestion', type: 'text', required: true, maxLength: 300 },
        { key: 'instruments', labelKey: 'wsFieldInstruments', type: 'text', maxLength: 160 },
        { key: 'targets', labelKey: 'wsFieldTargets', type: 'lines', maxLength: 4000 },
        { key: 'sources', labelKey: 'wsFieldSources', type: 'text', maxLength: 1000 },
      ]}
    />
  );
}

export function ObservingPlanSurface() {
  return (
    <ModuleSurface
      moduleId="plan"
      titleKey="wsMenuTasks"
      subtitleKey="wsAreaTasksDesc"
      noteKey="wsPlanNote"
      primaryKey="title"
      metaKeys={['date', 'site', 'priority', 'status']}
      linesKey="targets"
      renderExtra={(record: ModuleRecord) => <MoonChip value={record.data.date} />}
      fields={[
        { key: 'title', labelKey: 'wsFieldSession', type: 'text', required: true, maxLength: 160 },
        { key: 'date', labelKey: 'wsFieldDate', type: 'date', required: true },
        { key: 'site', labelKey: 'wsFieldSite', type: 'text', maxLength: 160 },
        { key: 'targets', labelKey: 'wsFieldTargets', type: 'lines', maxLength: 4000 },
        { key: 'priority', labelKey: 'wsFieldPriority', type: 'select', options: PRIORITY },
        {
          key: 'status',
          labelKey: 'wsFieldStatus',
          type: 'select',
          options: [
            { value: 'planned', labelKey: 'wsOptPlanned' },
            { value: 'done', labelKey: 'wsOptDone' },
            { value: 'skipped', labelKey: 'wsOptSkipped' },
          ],
        },
      ]}
    />
  );
}

/** Exported for tests: today's value in the format the date inputs use. */
export const todayInputValue = (): string => toDateInputValue(new Date());
