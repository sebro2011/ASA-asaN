/**
 * NOVA Intelligence — one surface for the L.I.F.E. engine.
 *
 * Eight panels, all fed by `/api/nova/life`: overview, memory, skills,
 * experiences, verification, models, security and benchmarks. Every number shown
 * came from the engine in this session; a failed call renders the engine's own
 * error code, never a placeholder value.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  BookOpen,
  Brain,
  CheckCircle2,
  Cpu,
  Database,
  FlaskConical,
  Gauge,
  History,
  KeyRound,
  Loader2,
  PlayCircle,
  RefreshCw,
  ShieldCheck,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  LifeApiError,
  lifeApi,
  type LifeAuditEvent,
  type LifeBenchmarkRun,
  type LifeExperience,
  type LifeMemory,
  type LifeSkill,
  type LifeStatus,
  type LifeTask,
  type LifeVerification,
  type ProviderStatus,
} from './lifeClient';

type TabId = 'overview' | 'memory' | 'skills' | 'experiences' | 'verification' | 'models' | 'security' | 'benchmarks';

const TABS: Array<{ id: TabId; labelKey: string; icon: typeof Activity }> = [
  { id: 'overview', labelKey: 'wsIntelOverview', icon: Gauge },
  { id: 'memory', labelKey: 'wsIntelMemory', icon: Brain },
  { id: 'skills', labelKey: 'wsIntelSkills', icon: FlaskConical },
  { id: 'experiences', labelKey: 'wsIntelExperiences', icon: History },
  { id: 'verification', labelKey: 'wsIntelVerification', icon: CheckCircle2 },
  { id: 'models', labelKey: 'wsIntelModels', icon: Cpu },
  { id: 'security', labelKey: 'wsIntelSecurity', icon: ShieldCheck },
  { id: 'benchmarks', labelKey: 'wsIntelBenchmarks', icon: Activity },
];

/**
 * Category labels are a literal map, not a template literal: the workspace shell
 * test rejects dynamic `t()` keys so a missing translation cannot slip through.
 */
const CATEGORY_KEYS: Record<string, string> = {
  working: 'wsIntelCategory_working',
  episodic: 'wsIntelCategory_episodic',
  semantic: 'wsIntelCategory_semantic',
  procedural: 'wsIntelCategory_procedural',
  personal: 'wsIntelCategory_personal',
};

function categoryLabel(t: (key: string) => string, category: string): string {
  return t(CATEGORY_KEYS[category] ?? 'wsIntelCategory_semantic');
}

interface AsyncState<T> {
  data: T | null;
  error: LifeApiError | null;
  loading: boolean;
}

function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<AsyncState<T>>({ data: null, error: null, loading: true });
  const reload = useCallback(() => {
    let cancelled = false;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    loader()
      .then((data) => {
        if (!cancelled) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setState({
            data: null,
            error: error instanceof LifeApiError ? error : new LifeApiError(String(error), 'CLIENT_ERROR', 0),
            loading: false,
          });
        }
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => reload(), [reload]);
  return { ...state, reload };
}

function ErrorState({ error, onRetry }: { error: LifeApiError; onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="nova-error" role="alert">
      <AlertTriangle size={14} strokeWidth={2} aria-hidden="true" />
      <div className="min-w-0">
        <p>{t('wsIntelError')}</p>
        <p className="font-mono text-[10px] uppercase tracking-[0.08em] text-ws-text-3">
          {error.code}
          {error.status ? ` · HTTP ${error.status}` : ''}
        </p>
        <p className="mt-1 text-[11px] leading-relaxed text-ws-text-3">{error.message}</p>
        <button type="button" className="nova-btn nova-btn--secondary mt-2" onClick={onRetry}>
          <RefreshCw size={12} strokeWidth={2} aria-hidden="true" />
          {t('wsIntelRetry')}
        </button>
      </div>
    </div>
  );
}

function Loading() {
  const { t } = useTranslation();
  return (
    <p className="flex items-center gap-2 text-[12px] text-ws-text-3" role="status">
      <Loader2 size={13} className="animate-spin" aria-hidden="true" />
      {t('wsIntelLoading')}
    </p>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="nova-stat">
      <p className="nova-stat__label">{label}</p>
      <p className="nova-stat__value">{value}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- overview */

function OverviewPanel() {
  const { t } = useTranslation();
  const status = useAsync<LifeStatus>(() => lifeApi.status());
  const tasks = useAsync(() => lifeApi.tasks());
  const [objective, setObjective] = useState('');
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<LifeApiError | null>(null);
  const [paused, setPaused] = useState<string | null>(null);

  if (status.loading) return <Loading />;
  if (status.error) return <ErrorState error={status.error} onRetry={status.reload} />;
  const data = status.data!;

  const createAndRun = async () => {
    if (!objective.trim()) return;
    setBusy(true);
    setActionError(null);
    setPaused(null);
    try {
      const task = await lifeApi.createTask(objective.trim());
      const outcome = await lifeApi.runTask(task.id);
      if (outcome.paused) setPaused(outcome.capability ?? 'APPROVAL_REQUIRED');
      setObjective('');
      tasks.reload();
    } catch (error) {
      setActionError(error instanceof LifeApiError ? error : new LifeApiError(String(error), 'CLIENT_ERROR', 0));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-4">
      <section className="nova-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className={`nova-chip ${data.mode.localOnly ? 'nova-chip--accent' : ''}`}>
            {data.mode.localOnly ? t('wsIntelLocalOnly') : t('wsIntelCloudAllowed')}
          </span>
          <span className="nova-chip">{data.hardware.label}</span>
          <span className="nova-chip">
            <Database size={10} aria-hidden="true" /> {data.storage.engine}
            {data.storage.fts ? ' · FTS5' : ''} · v{data.schemaVersion}
          </span>
          {data.storage.ephemeral ? (
            <span className="nova-chip" title={t('wsIntelEphemeralHint')}>
              {t('wsIntelEphemeral')}
            </span>
          ) : null}
          {data.mode.executionEnabled ? (
            <span className="nova-chip nova-chip--danger">{t('wsIntelExecutionOn')}</span>
          ) : (
            <span className="nova-chip">{t('wsIntelExecutionOff')}</span>
          )}
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label={t('wsIntelMemoryCount')} value={Number(data.counts.memories ?? 0)} />
          <Stat label={t('wsIntelTaskCount')} value={Number(data.counts.tasks ?? 0)} />
          <Stat label={t('wsIntelSkillCount')} value={`${Number(data.counts.activeSkills ?? 0)}/${Number(data.counts.skills ?? 0)}`} />
          <Stat label={t('wsIntelVerificationCount')} value={Number(data.counts.verifications ?? 0)} />
        </div>
        <p className="mt-3 text-[11px] leading-relaxed text-ws-text-3">{data.architecture}</p>
      </section>

      <section className="nova-card p-4">
        <h2 className="text-[13px] font-semibold text-ws-text">{t('wsIntelNewTask')}</h2>
        <p className="mt-1 text-[11px] leading-relaxed text-ws-text-3">{t('wsIntelTaskNote')}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <input
            className="nova-field__input flex-1"
            style={{ minWidth: '16rem' }}
            value={objective}
            onChange={(event) => setObjective(event.target.value)}
            placeholder={t('wsIntelObjectivePlaceholder')}
            aria-label={t('wsIntelObjective')}
          />
          <button type="button" className="nova-btn nova-btn--primary" onClick={createAndRun} disabled={busy || !objective.trim()}>
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <PlayCircle size={13} strokeWidth={2} aria-hidden="true" />}
            {t('wsIntelRunTask')}
          </button>
        </div>
        {paused ? (
          <p className="nova-error mt-2" role="alert">
            {t('wsIntelTaskPaused', { capability: paused })}
          </p>
        ) : null}
        {actionError ? <ErrorState error={actionError} onRetry={() => setActionError(null)} /> : null}
      </section>

      <section className="nova-card p-4">
        <h2 className="text-[13px] font-semibold text-ws-text">{t('wsIntelTasks')}</h2>
        {tasks.loading ? <Loading /> : null}
        {tasks.error ? <ErrorState error={tasks.error} onRetry={tasks.reload} /> : null}
        {tasks.data && tasks.data.tasks.length === 0 ? (
          <p className="mt-2 text-[12px] text-ws-text-3">{t('wsIntelNoTasks')}</p>
        ) : null}
        {tasks.data && tasks.data.tasks.length > 0 ? (
          <ul className="mt-2 grid list-none gap-2 p-0">
            {tasks.data.tasks.map((task: LifeTask) => (
              <li key={task.id} className="nova-record">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <p className="nova-record__title">{task.objective}</p>
                  <StatusChip status={task.status} />
                </div>
                <p className="nova-record__meta">
                  <span>{new Date(task.createdAt).toLocaleString()}</span>
                  <span>{task.language}</span>
                  <span>{task.allowedTools.join(', ') || '—'}</span>
                </p>
                {task.result?.summary ? <p className="nova-record__notes">{task.result.summary}</p> : null}
              </li>
            ))}
          </ul>
        ) : null}
      </section>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = status === 'completed' || status === 'active' || status === 'verified' ? 'ok' : status === 'failed' || status === 'rejected' ? 'bad' : 'neutral';
  return <span className={`nova-chip ${tone === 'ok' ? 'nova-chip--ok' : tone === 'bad' ? 'nova-chip--danger' : ''}`}>{status.replace(/_/g, ' ')}</span>;
}

/* ------------------------------------------------------------------ memory */

function MemoryPanel() {
  const { t } = useTranslation();
  const [category, setCategory] = useState<string>('');
  const memory = useAsync(() => lifeApi.memory(category || undefined), [category]);
  const [form, setForm] = useState({ title: '', body: '', category: 'semantic' });
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Array<{ memory: LifeMemory; score: number }> | null>(null);
  const [error, setError] = useState<LifeApiError | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      await lifeApi.addMemory(form);
      setForm({ title: '', body: '', category: form.category });
      memory.reload();
    } catch (caught) {
      setError(caught instanceof LifeApiError ? caught : new LifeApiError(String(caught), 'CLIENT_ERROR', 0));
    } finally {
      setBusy(false);
    }
  };

  const search = async () => {
    setError(null);
    try {
      const outcome = await lifeApi.searchMemory(query);
      setResults(outcome.results);
    } catch (caught) {
      setError(caught instanceof LifeApiError ? caught : new LifeApiError(String(caught), 'CLIENT_ERROR', 0));
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await lifeApi.deleteMemory(id);
      setResults(null);
      memory.reload();
    } catch (caught) {
      setError(caught instanceof LifeApiError ? caught : new LifeApiError(String(caught), 'CLIENT_ERROR', 0));
    }
  };

  const categories = memory.data?.categories ?? ['working', 'episodic', 'semantic', 'procedural', 'personal'];
  const list = results ?? (memory.data?.memories ?? []).map((entry) => ({ memory: entry, score: 0 }));

  return (
    <div className="grid gap-4">
      <section className="nova-card p-4">
        <h2 className="text-[13px] font-semibold text-ws-text">{t('wsIntelMemoryAdd')}</h2>
        <div className="mt-2 grid gap-2 sm:grid-cols-[8rem_1fr]">
          <select
            className="nova-field__input"
            value={form.category}
            onChange={(event) => setForm({ ...form, category: event.target.value })}
            aria-label={t('wsIntelMemoryCategory')}
          >
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {categoryLabel(t, entry)}
              </option>
            ))}
          </select>
          <input
            className="nova-field__input"
            value={form.title}
            onChange={(event) => setForm({ ...form, title: event.target.value })}
            placeholder={t('wsIntelMemoryTitle')}
            aria-label={t('wsIntelMemoryTitle')}
          />
          <textarea
            className="nova-field__input nova-field__textarea sm:col-span-2"
            rows={3}
            value={form.body}
            onChange={(event) => setForm({ ...form, body: event.target.value })}
            placeholder={t('wsIntelMemoryBody')}
            aria-label={t('wsIntelMemoryBody')}
          />
        </div>
        <button type="button" className="nova-btn nova-btn--primary mt-2" onClick={save} disabled={busy || !form.title.trim() || !form.body.trim()}>
          {t('wsIntelMemorySave')}
        </button>
        <p className="mt-2 text-[11px] leading-relaxed text-ws-text-3">{t('wsIntelMemoryNote')}</p>
      </section>

      <section className="nova-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          <select className="nova-field__input" style={{ maxWidth: '12rem' }} value={category} onChange={(event) => setCategory(event.target.value)} aria-label={t('wsIntelMemoryCategory')}>
            <option value="">{t('wsIntelAllCategories')}</option>
            {categories.map((entry) => (
              <option key={entry} value={entry}>
                {categoryLabel(t, entry)}
              </option>
            ))}
          </select>
          <input
            className="nova-field__input flex-1"
            style={{ minWidth: '12rem' }}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t('wsIntelMemorySearch')}
            aria-label={t('wsIntelMemorySearch')}
          />
          <button type="button" className="nova-btn nova-btn--secondary" onClick={search} disabled={query.trim().length === 0}>
            {t('wsIntelSearch')}
          </button>
          {results ? (
            <button type="button" className="nova-btn nova-btn--ghost" onClick={() => setResults(null)}>
              {t('wsIntelClearSearch')}
            </button>
          ) : null}
        </div>
        {error ? <ErrorState error={error} onRetry={() => setError(null)} /> : null}
        {memory.loading ? <Loading /> : null}
        {memory.error ? <ErrorState error={memory.error} onRetry={memory.reload} /> : null}
        {list.length === 0 && !memory.loading ? <p className="mt-2 text-[12px] text-ws-text-3">{t('wsIntelMemoryEmpty')}</p> : null}
        <ul className="mt-3 grid list-none gap-2 p-0 lg:grid-cols-2">
          {list.map(({ memory: entry, score }) => (
            <li key={entry.id} className="nova-record">
              <div className="flex items-start justify-between gap-2">
                <p className="nova-record__title">{entry.title}</p>
                <button
                  type="button"
                  className="nova-icon-btn"
                  aria-label={t('wsIntelDelete')}
                  onClick={() => remove(entry.id)}
                >
                  <Trash2 size={12} strokeWidth={2} aria-hidden="true" />
                </button>
              </div>
              <p className="nova-record__meta">
                <span>{categoryLabel(t, entry.category)}</span>
                <span>{entry.language}</span>
                <span>v{entry.version}</span>
                {score > 0 ? <span>score {score.toFixed(3)}</span> : null}
              </p>
              <p className="nova-record__notes">{entry.body}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* ------------------------------------------------------------------ skills */

function SkillsPanel() {
  const { t } = useTranslation();
  const skills = useAsync(() => lifeApi.skills());
  const [error, setError] = useState<LifeApiError | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [checks, setChecks] = useState<Record<string, Array<{ name: string; passed: boolean; detail: string }>>>({});
  const [approved, setApproved] = useState<Record<string, boolean>>({});

  const act = async (id: string, action: string, extra: Record<string, unknown> = {}) => {
    setBusyId(id);
    setError(null);
    try {
      if (action === 'test') {
        const outcome = await lifeApi.skillAction(id, 'test');
        setChecks((previous) => ({ ...previous, [id]: outcome.checks ?? [] }));
      } else {
        await lifeApi.skillAction(id, action, extra);
      }
      skills.reload();
    } catch (caught) {
      setError(caught instanceof LifeApiError ? caught : new LifeApiError(String(caught), 'CLIENT_ERROR', 0));
    } finally {
      setBusyId(null);
    }
  };

  const approveAndActivate = async (id: string) => {
    setBusyId(id);
    setError(null);
    try {
      await lifeApi.approve('skill', id, 'approved', 'approved in NOVA Intelligence');
      setApproved((previous) => ({ ...previous, [id]: true }));
      await lifeApi.skillAction(id, 'activate');
      skills.reload();
    } catch (caught) {
      setError(caught instanceof LifeApiError ? caught : new LifeApiError(String(caught), 'CLIENT_ERROR', 0));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="grid gap-4">
      <p className="text-[11px] leading-relaxed text-ws-text-3">{t('wsIntelSkillFlowNote')}</p>
      {error ? <ErrorState error={error} onRetry={() => setError(null)} /> : null}
      {skills.loading ? <Loading /> : null}
      {skills.error ? <ErrorState error={skills.error} onRetry={skills.reload} /> : null}
      {skills.data && skills.data.skills.length === 0 ? <p className="text-[12px] text-ws-text-3">{t('wsIntelSkillsEmpty')}</p> : null}
      <ul className="grid list-none gap-3 p-0">
        {(skills.data?.skills ?? []).map((skill: LifeSkill) => (
          <li key={skill.id} className="nova-record">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="nova-record__title">{skill.name}</p>
                <p className="mt-0.5 text-[11.5px] leading-relaxed text-ws-text-2">{skill.description}</p>
              </div>
              <StatusChip status={skill.status} />
            </div>
            <p className="nova-record__meta">
              <span>{t('wsIntelSkillVersion', { version: skill.currentVersion })}</span>
              <span>{t('wsIntelSkillVersions', { count: skill.versionCount ?? 0 })}</span>
              <span>{skill.permissions.join(', ') || t('wsIntelNoPermissions')}</span>
            </p>
            {checks[skill.id]?.length ? (
              <ul className="mt-1 list-none space-y-1 p-0">
                {checks[skill.id].map((check) => (
                  <li key={check.name} className="flex items-start gap-1.5 text-[11px] text-ws-text-2">
                    {check.passed ? (
                      <CheckCircle2 size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                    ) : (
                      <XCircle size={12} className="mt-0.5 shrink-0 text-ws-danger" aria-hidden="true" />
                    )}
                    <span>
                      {check.name} — {check.detail}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="nova-record__actions">
              {skill.status === 'draft' || skill.status === 'discovered' || skill.status === 'rejected' ? (
                <button type="button" className="nova-btn nova-btn--secondary" disabled={busyId === skill.id} onClick={() => act(skill.id, 'submit')}>
                  {t('wsIntelSkillSubmit')}
                </button>
              ) : null}
              {skill.status === 'sandbox_testing' ? (
                <button type="button" className="nova-btn nova-btn--secondary" disabled={busyId === skill.id} onClick={() => act(skill.id, 'test')}>
                  {t('wsIntelSkillTest')}
                </button>
              ) : null}
              {skill.status === 'verification' ? (
                <button
                  type="button"
                  className="nova-btn nova-btn--secondary"
                  disabled={busyId === skill.id}
                  onClick={() => act(skill.id, 'request-approval')}
                >
                  {t('wsIntelSkillRequestApproval')}
                </button>
              ) : null}
              {skill.status === 'user_approval' ? (
                <button type="button" className="nova-btn nova-btn--primary" disabled={busyId === skill.id} onClick={() => approveAndActivate(skill.id)}>
                  <KeyRound size={12} strokeWidth={2} aria-hidden="true" />
                  {t('wsIntelSkillApproveActivate')}
                </button>
              ) : null}
              {skill.status === 'active' ? (
                <button
                  type="button"
                  className="nova-btn nova-btn--secondary"
                  disabled={busyId === skill.id || skill.currentVersion <= 1}
                  onClick={() => act(skill.id, 'rollback', { version: Math.max(1, skill.currentVersion - 1) })}
                >
                  {t('wsIntelSkillRollback', { version: Math.max(1, skill.currentVersion - 1) })}
                </button>
              ) : null}
              {approved[skill.id] ? <span className="nova-chip">{t('wsIntelApprovalRecorded')}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* -------------------------------------------------------------- experiences */

function ExperiencePanel() {
  const { t } = useTranslation();
  const experiences = useAsync(() => lifeApi.experiences());
  const [replayed, setReplayed] = useState<Record<string, string[]>>({});
  const [error, setError] = useState<LifeApiError | null>(null);

  const replay = async (id: string) => {
    setError(null);
    try {
      const outcome = await lifeApi.replay(id);
      setReplayed((previous) => ({ ...previous, [id]: outcome.steps.map((step) => step.title) }));
    } catch (caught) {
      setError(caught instanceof LifeApiError ? caught : new LifeApiError(String(caught), 'CLIENT_ERROR', 0));
    }
  };

  if (experiences.loading) return <Loading />;
  if (experiences.error) return <ErrorState error={experiences.error} onRetry={experiences.reload} />;
  const list = experiences.data?.experiences ?? [];

  return (
    <div className="grid gap-3">
      {error ? <ErrorState error={error} onRetry={() => setError(null)} /> : null}
      {list.length === 0 ? <p className="text-[12px] text-ws-text-3">{t('wsIntelExperiencesEmpty')}</p> : null}
      <ul className="grid list-none gap-2 p-0 lg:grid-cols-2">
        {list.map((experience: LifeExperience) => (
          <li key={experience.id} className="nova-record">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="nova-record__title">{experience.objective}</p>
              <StatusChip status={experience.outcome} />
            </div>
            <p className="nova-record__meta">
              <span>{experience.taskType}</span>
              <span>{experience.verified ? t('wsIntelVerified') : t('wsIntelUnverified')}</span>
              <span>{experience.replayable ? t('wsIntelReplayable') : t('wsIntelNotReplayable')}</span>
              <span>{experience.evidenceIds.length} evidence</span>
            </p>
            <p className="nova-record__notes">{experience.executionSummary}</p>
            {replayed[experience.id] ? (
              <ul className="mt-1 list-none space-y-0.5 p-0 text-[11px] text-ws-text-2">
                {replayed[experience.id].map((title) => (
                  <li key={title}>• {title}</li>
                ))}
              </ul>
            ) : null}
            <div className="nova-record__actions">
              <button type="button" className="nova-btn nova-btn--secondary" disabled={!experience.replayable} onClick={() => replay(experience.id)}>
                {t('wsIntelReplay')}
              </button>
              {!experience.replayable ? <span className="text-[10.5px] text-ws-text-3">{t('wsIntelReplayBlocked')}</span> : null}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ------------------------------------------------------------- verification */

function VerificationPanel() {
  const { t } = useTranslation();
  const verifications = useAsync(() => lifeApi.verifications());
  const [selected, setSelected] = useState<LifeVerification | null>(null);
  const evidence = useAsync<{ evidence: Array<{ id: string; label: string; kind: string; digest: string }> }>(
    () => (selected ? lifeApi.evidence(selected.taskId) : Promise.resolve({ evidence: [] })),
    [selected?.id],
  );

  if (verifications.loading) return <Loading />;
  if (verifications.error) return <ErrorState error={verifications.error} onRetry={verifications.reload} />;
  const list = verifications.data?.verifications ?? [];

  return (
    <div className="grid gap-3">
      {list.length === 0 ? <p className="text-[12px] text-ws-text-3">{t('wsIntelVerificationEmpty')}</p> : null}
      <ul className="grid list-none gap-2 p-0 lg:grid-cols-2">
        {list.map((record) => (
          <li key={record.id} className="nova-record">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <p className="nova-record__title font-mono text-[11px]">{record.taskId}</p>
              <StatusChip status={record.status} />
            </div>
            <p className="nova-record__meta">
              <span>{new Date(record.verifiedAt).toLocaleString()}</span>
              <span>{t('wsIntelChecks', { count: record.checks.length })}</span>
              <span>{t('wsIntelEvidenceCount', { count: record.evidenceIds.length })}</span>
            </p>
            <ul className="mt-1 list-none space-y-0.5 p-0">
              {record.checks.map((check) => (
                <li key={check.name} className="flex items-start gap-1.5 text-[11px] text-ws-text-2">
                  {check.passed ? (
                    <CheckCircle2 size={12} className="mt-0.5 shrink-0" aria-hidden="true" />
                  ) : (
                    <XCircle size={12} className="mt-0.5 shrink-0 text-ws-danger" aria-hidden="true" />
                  )}
                  <span>
                    {check.name} — {check.detail ?? ''}
                  </span>
                </li>
              ))}
            </ul>
            {record.errors.length > 0 ? <p className="text-[11px] text-ws-danger">{record.errors.join(' · ')}</p> : null}
            <div className="nova-record__actions">
              <button type="button" className="nova-btn nova-btn--secondary" onClick={() => setSelected(record)}>
                {t('wsIntelViewEvidence')}
              </button>
            </div>
          </li>
        ))}
      </ul>
      {selected ? (
        <section className="nova-card p-4">
          <h2 className="text-[12px] font-semibold text-ws-text">
            {t('wsIntelEvidenceFor', { task: selected.taskId })}
          </h2>
          {evidence.loading ? <Loading /> : null}
          {evidence.error ? <ErrorState error={evidence.error} onRetry={evidence.reload} /> : null}
          {evidence.data && evidence.data.evidence.length === 0 ? (
            <p className="mt-1 text-[11px] text-ws-text-3">{t('wsIntelNoEvidence')}</p>
          ) : null}
          <ul className="mt-2 list-none space-y-1 p-0">
            {evidence.data?.evidence.map((entry) => (
              <li key={entry.id} className="text-[11px] text-ws-text-2">
                <span className="nova-chip">{entry.kind}</span> {entry.label}{' '}
                <span className="font-mono text-[10px] text-ws-text-3">#{entry.digest}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ models */

function ModelsPanel() {
  const { t } = useTranslation();
  const health = useAsync(() => lifeApi.health());
  const config = useAsync(() => lifeApi.config());

  return (
    <div className="grid gap-3">
      <section className="nova-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-[13px] font-semibold text-ws-text">{t('wsIntelProviders')}</h2>
          <button type="button" className="nova-btn nova-btn--secondary" onClick={health.reload}>
            <RefreshCw size={12} strokeWidth={2} aria-hidden="true" />
            {t('wsIntelCheckProviders')}
          </button>
        </div>
        {health.loading ? <Loading /> : null}
        {health.error ? <ErrorState error={health.error} onRetry={health.reload} /> : null}
        {health.data ? (
          <>
            <p className="mt-2 text-[11px] text-ws-text-3">
              {t('wsIntelLocalAvailable', { value: health.data.localAvailable ? t('wsIntelYes') : t('wsIntelNo') })}
            </p>
            <table className="nova-record__table mt-2">
              <thead>
                <tr>
                  <th scope="col">{t('wsIntelProvider')}</th>
                  <th scope="col">{t('wsIntelKind')}</th>
                  <th scope="col">{t('wsIntelStatus')}</th>
                  <th scope="col">{t('wsIntelModelsFound')}</th>
                  <th scope="col">{t('wsIntelLatency')}</th>
                </tr>
              </thead>
              <tbody>
                {health.data.providers.map((provider: ProviderStatus) => (
                  <tr key={provider.id}>
                    <td>{provider.label}</td>
                    <td>{provider.kind}</td>
                    <td>
                      {provider.status}
                      {provider.detail ? <span className="text-ws-text-3"> · {provider.detail}</span> : null}
                    </td>
                    <td>{provider.models.length}</td>
                    <td>{provider.latencyMs === null ? '—' : `${provider.latencyMs} ms`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </section>

      <section className="nova-card p-4">
        <h2 className="text-[13px] font-semibold text-ws-text">{t('wsIntelMode')}</h2>
        {config.loading ? <Loading /> : null}
        {config.error ? <ErrorState error={config.error} onRetry={config.reload} /> : null}
        {config.data ? (
          <ul className="mt-2 list-none space-y-1 p-0 text-[11.5px] text-ws-text-2">
            <li>
              {t('wsIntelLocalOnlySetting')}: <strong>{config.data.localOnly ? t('wsIntelOn') : t('wsIntelOff')}</strong>
            </li>
            <li>
              {t('wsIntelExecutionSetting')}: <strong>{config.data.executionEnabled ? t('wsIntelOn') : t('wsIntelOff')}</strong>
            </li>
          </ul>
        ) : null}
        <p className="mt-2 text-[11px] leading-relaxed text-ws-text-3">{t('wsIntelLocalOnlyNote')}</p>
      </section>
    </div>
  );
}

/* ---------------------------------------------------------------- security */

function SecurityPanel() {
  const { t } = useTranslation();
  const security = useAsync(() => lifeApi.security());
  const [error, setError] = useState<LifeApiError | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const toggle = async (capability: string, granted: boolean) => {
    setPending(capability);
    setError(null);
    try {
      await lifeApi.setGrant(capability, granted);
      security.reload();
    } catch (caught) {
      setError(caught instanceof LifeApiError ? caught : new LifeApiError(String(caught), 'CLIENT_ERROR', 0));
    } finally {
      setPending(null);
    }
  };

  if (security.loading) return <Loading />;
  if (security.error) return <ErrorState error={security.error} onRetry={security.reload} />;
  const data = security.data!;

  return (
    <div className="grid gap-3">
      <p className="text-[11px] leading-relaxed text-ws-text-3">{t('wsIntelSecurityNote')}</p>
      {error ? <ErrorState error={error} onRetry={() => setError(null)} /> : null}

      <section className="nova-card p-4">
        <h2 className="text-[13px] font-semibold text-ws-text">{t('wsIntelPermissions')}</h2>
        <ul className="mt-2 grid list-none gap-1.5 p-0">
          {data.permissions.map((permission) => (
            <li key={permission.id} className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-[11.5px] text-ws-text-2">
                <span className="font-mono text-[10.5px]">{permission.id}</span> · {permission.label}
                {permission.requiresApproval ? <span className="text-ws-text-3"> · {t('wsIntelNeedsApproval')}</span> : null}
              </span>
              <button
                type="button"
                className={`nova-btn ${permission.granted ? 'nova-btn--secondary' : 'nova-btn--primary'}`}
                onClick={() => toggle(permission.id, !permission.granted)}
                disabled={pending === permission.id}
              >
                {permission.granted ? t('wsIntelRevoke') : t('wsIntelGrant')}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="nova-card p-4">
        <h2 className="text-[13px] font-semibold text-ws-text">{t('wsIntelTools')}</h2>
        <ul className="mt-2 list-none space-y-1 p-0">
          {data.tools.map((tool) => (
            <li key={tool.id} className="flex flex-wrap items-center justify-between gap-2 text-[11.5px] text-ws-text-2">
              <span>
                <span className="font-mono text-[10.5px]">{tool.id}</span> · {tool.level}
              </span>
              <span className={`nova-chip ${tool.enabled ? '' : 'nova-chip--danger'}`}>
                {tool.enabled ? (tool.granted ? t('wsIntelGranted') : t('wsIntelNotGranted')) : t('wsIntelDisabled')}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="nova-card p-4">
        <h2 className="text-[13px] font-semibold text-ws-text">{t('wsIntelAudit')}</h2>
        {data.audit.length === 0 ? <p className="mt-1 text-[11px] text-ws-text-3">{t('wsIntelAuditEmpty')}</p> : null}
        <ul className="mt-2 list-none space-y-1 p-0">
          {data.audit.map((event: LifeAuditEvent) => (
            <li key={event.id} className="flex flex-wrap items-center gap-2 text-[11px] text-ws-text-2">
              <span className={`nova-chip ${event.severity === 'critical' ? 'nova-chip--danger' : ''}`}>{event.severity}</span>
              <span className="font-mono text-[10.5px]">{event.kind}</span>
              {event.subject ? <span className="text-ws-text-3">{event.subject}</span> : null}
              <span className="text-ws-text-3">{new Date(event.created_at).toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/* -------------------------------------------------------------- benchmarks */

function BenchmarksPanel() {
  const { t } = useTranslation();
  const benchmarks = useAsync(() => lifeApi.benchmarks());
  const [run, setRun] = useState<LifeBenchmarkRun | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<LifeApiError | null>(null);

  const execute = async () => {
    setBusy(true);
    setError(null);
    try {
      setRun(await lifeApi.runBenchmarks());
    } catch (caught) {
      setError(caught instanceof LifeApiError ? caught : new LifeApiError(String(caught), 'CLIENT_ERROR', 0));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid gap-3">
      <section className="nova-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-[13px] font-semibold text-ws-text">{t('wsIntelBenchmarks')}</h2>
            <p className="mt-1 text-[11px] text-ws-text-3">
              {benchmarks.data ? t('wsIntelBenchCases', { count: benchmarks.data.dataset.length }) : ''}
            </p>
          </div>
          <button type="button" className="nova-btn nova-btn--primary" onClick={execute} disabled={busy}>
            {busy ? <Loader2 size={13} className="animate-spin" aria-hidden="true" /> : <Activity size={13} strokeWidth={2} aria-hidden="true" />}
            {t('wsIntelBenchRun')}
          </button>
        </div>
        {error ? <ErrorState error={error} onRetry={() => setError(null)} /> : null}
        {benchmarks.loading ? <Loading /> : null}
        {benchmarks.error ? <ErrorState error={benchmarks.error} onRetry={benchmarks.reload} /> : null}
        {benchmarks.data && benchmarks.data.history.length === 0 && !run ? (
          <p className="mt-2 text-[11px] text-ws-text-3">{t('wsIntelBenchEmpty')}</p>
        ) : null}
        {benchmarks.data && benchmarks.data.history.length > 0 ? (
          <table className="nova-record__table mt-3">
            <thead>
              <tr>
                <th scope="col">{t('wsIntelBenchRunId')}</th>
                <th scope="col">{t('wsIntelBenchTotal')}</th>
                <th scope="col">{t('wsIntelBenchMeasured')}</th>
              </tr>
            </thead>
            <tbody>
              {benchmarks.data.history.map((entry) => (
                <tr key={entry.runId}>
                  <td className="font-mono">{entry.runId.slice(0, 12)}</td>
                  <td>
                    {entry.passed}/{entry.total}
                  </td>
                  <td>{new Date(entry.measuredAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </section>

      {run ? (
        <section className="nova-card p-4" aria-live="polite">
          <h2 className="text-[13px] font-semibold text-ws-text">
            {t('wsIntelBenchResult', { passed: run.passed, total: run.total })}
          </h2>
          <div className="mt-2 grid grid-cols-3 gap-2">
            {Object.entries(run.byLanguage).map(([language, value]) => (
              <Stat key={language} label={language.toUpperCase()} value={`${value.passed}/${value.total} · ${value.latencyMs} ms`} />
            ))}
          </div>
          <ul className="mt-2 list-none space-y-1 p-0">
            {run.results.map((result) => (
              <li key={result.caseId} className="flex flex-wrap items-center gap-2 text-[11px] text-ws-text-2">
                {result.passed ? (
                  <CheckCircle2 size={12} aria-hidden="true" />
                ) : (
                  <XCircle size={12} className="text-ws-danger" aria-hidden="true" />
                )}
                <span>{result.name}</span>
                <span className="text-ws-text-3">
                  {result.language} · {result.latencyMs} ms · {result.detail}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}

/* ----------------------------------------------------------------- surface */

export default function IntelligenceSurface() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<TabId>('overview');

  return (
    <div className="mx-auto w-full max-w-[1180px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
      <header className="min-w-0">
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-ws-text-3">{t('wsWorkspace')}</p>
        <h1 className="mt-1.5 flex items-center gap-2 text-[26px] font-semibold leading-tight tracking-[-0.02em] text-ws-text">
          <BookOpen size={22} strokeWidth={1.9} aria-hidden="true" className="text-ws-accent-ink" />
          {t('wsIntelTitle')}
        </h1>
        <p className="mt-2 max-w-[48rem] text-[13px] leading-relaxed text-ws-text-2">{t('wsIntelSubtitle')}</p>
      </header>

      <div className="mt-4 flex flex-wrap gap-1" role="tablist" aria-label={t('wsIntelTitle')}>
        {TABS.map((entry) => {
          const Icon = entry.icon;
          const active = tab === entry.id;
          return (
            <button
              key={entry.id}
              type="button"
              role="tab"
              aria-selected={active}
              className={`nova-btn ${active ? 'nova-btn--primary' : 'nova-btn--ghost'}`}
              onClick={() => setTab(entry.id)}
            >
              <Icon size={13} strokeWidth={2} aria-hidden="true" />
              {t(entry.labelKey)}
            </button>
          );
        })}
      </div>

      <div className="mt-4" role="tabpanel">
        {tab === 'overview' ? <OverviewPanel /> : null}
        {tab === 'memory' ? <MemoryPanel /> : null}
        {tab === 'skills' ? <SkillsPanel /> : null}
        {tab === 'experiences' ? <ExperiencePanel /> : null}
        {tab === 'verification' ? <VerificationPanel /> : null}
        {tab === 'models' ? <ModelsPanel /> : null}
        {tab === 'security' ? <SecurityPanel /> : null}
        {tab === 'benchmarks' ? <BenchmarksPanel /> : null}
      </div>
    </div>
  );
}
