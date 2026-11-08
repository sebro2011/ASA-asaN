/**
 * NOVA HYPOTHESIS FORGE — scientific investigation surface.
 *
 * This is a *mode inside the existing NOVA AI Assistant* (see ChatSurface), not
 * a second chatbot. It renders the eight sections required by the brief:
 * workspace, hypothesis explorer, data explorer, evidence laboratory, analysis,
 * counter-evidence centre, Evidence Passport and research history.
 *
 * Honesty rules enforced in the UI:
 *  - every number shown comes from a retrieved observation or a deterministic
 *    analysis result in the response;
 *  - a missing/unavailable source is labelled as such, never filled in;
 *  - the conclusion can never render as "proven";
 *  - generated content is labelled in the passport;
 *  - research history is device-local and says so.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileJson,
  FlaskConical,
  History,
  Info,
  Layers,
  Loader2,
  Microscope,
  Play,
  Printer,
  RefreshCw,
  ShieldAlert,
  Sparkles,
  Trash2,
  XCircle,
} from 'lucide-react';
import type {
  AnalysisResult,
  EvidenceClassification,
  ForgeSectionId,
  Hypothesis,
  Investigation,
  ResearchRequest,
} from '../../lib/forge/types';
import {
  fetchCatalogue,
  interpretResearch,
  runInvestigation,
  type ForgeCatalogue,
  type ForgeErrorCode,
  type InterpretPayload,
} from '../../lib/forge/client';
import { activeStatement, decideHypothesis, type HypothesisDecision } from '../../lib/forge/hypotheses';
import {
  buildPassport,
  passportToHtml,
  passportToJson,
  passportToMarkdown,
} from '../../lib/forge/passport';
import {
  clearMemory,
  compareInvestigations,
  deleteInvestigation,
  exportMemoryJson,
  getInvestigation,
  listInvestigations,
  saveInvestigation,
  type StoredInvestigation,
} from '../../lib/forge/memory';
import {
  EvidenceChart,
  HypothesisGraph,
  LagChart,
  QualityChart,
  RelationshipScatter,
  TimeSeriesChart,
  seriesOptionsFrom,
} from './ForgeCharts';

const SECTIONS: ForgeSectionId[] = [
  'workspace',
  'hypotheses',
  'data',
  'evidence',
  'analysis',
  'counter',
  'passport',
  'history',
];

const SECTION_KEY: Record<ForgeSectionId, string> = {
  workspace: 'hfTabWorkspace',
  hypotheses: 'hfTabHypotheses',
  data: 'hfTabData',
  evidence: 'hfTabEvidence',
  analysis: 'hfTabAnalysis',
  counter: 'hfTabCounter',
  passport: 'hfTabPassport',
  history: 'hfTabHistory',
};

const ERROR_KEY: Record<ForgeErrorCode, string> = {
  INVALID_REQUEST: 'hfErrorInvalid',
  QUESTION_TOO_LONG: 'hfErrorInvalid',
  RATE_LIMITED: 'hfErrorRateLimit',
  SOURCE_UNAVAILABLE: 'hfErrorGeneric',
  NETWORK: 'hfErrorNetwork',
  TIMEOUT: 'hfErrorTimeout',
  INTERNAL_ERROR: 'hfErrorGeneric',
  UNKNOWN: 'hfErrorGeneric',
};

const VERDICT_KEY: Record<string, string> = {
  'insufficient-evidence': 'hfVerdictInsufficient',
  'not-supported': 'hfVerdictNotSupported',
  mixed: 'hfVerdictMixed',
  'weakly-supported': 'hfVerdictWeak',
};

const KIND_KEY: Record<string, string> = {
  assumption: 'hfKindAssumption',
  'alternative-explanation': 'hfKindAlternative',
  'missing-variable': 'hfKindMissingVariable',
  'temporal-mismatch': 'hfKindTemporal',
  'measurement-uncertainty': 'hfKindUncertainty',
  'selection-bias': 'hfKindSelection',
  'data-gap': 'hfKindGap',
  falsification: 'hfKindFalsification',
};

const SEVERITY_KEY: Record<string, string> = {
  low: 'hfSeverityLow',
  medium: 'hfSeverityMedium',
  high: 'hfSeverityHigh',
};

const CLASS_KEY: Record<EvidenceClassification, string> = {
  supporting: 'hfSupporting',
  contradicting: 'hfContradicting',
  neutral: 'hfNeutral',
  insufficient: 'hfInsufficient',
};

function downloadFile(name: string, content: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = name;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2_000);
}

function Chip({
  tone = 'neutral',
  children,
}: {
  tone?: 'neutral' | 'good' | 'warn' | 'bad' | 'info';
  children: ReactNode;
}) {
  return <span className={`forge-chip forge-chip--${tone}`}>{children}</span>;
}

function Section({
  title,
  hint,
  actions,
  children,
}: {
  title: string;
  hint?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="forge-panel">
      <header className="forge-panel__head">
        <div>
          <h2 className="forge-panel__title">{title}</h2>
          {hint ? <p className="forge-panel__hint">{hint}</p> : null}
        </div>
        {actions ? <div className="forge-panel__actions">{actions}</div> : null}
      </header>
      {children}
    </section>
  );
}

function DefinitionList({ items }: { items: Array<{ label: string; value: ReactNode }> }) {
  return (
    <dl className="forge-dl">
      {items.map((item) => (
        <div key={item.label} className="forge-dl__row">
          <dt>{item.label}</dt>
          <dd>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

function coverageTone(coverage: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (coverage === 'in-range') return 'good';
  if (coverage === 'partial') return 'warn';
  if (coverage === 'out-of-coverage') return 'bad';
  return 'neutral';
}

function statusTone(status: string): 'good' | 'warn' | 'bad' | 'neutral' {
  if (status === 'live' || status === 'cached') return 'good';
  if (status === 'partial') return 'warn';
  if (status === 'unavailable' || status === 'out-of-coverage') return 'bad';
  return 'neutral';
}

function ResultGrid({ analysis }: { analysis: AnalysisResult }) {
  const entries = Object.entries(analysis.results);
  if (entries.length === 0) return null;
  return (
    <div className="forge-results">
      {entries.map(([key, value]) => (
        <div key={key} className="forge-results__cell">
          <span className="forge-results__key">{key}</span>
          <span className="forge-results__value">
            {typeof value === 'number'
              ? new Intl.NumberFormat('en', { maximumSignificantDigits: 5 }).format(value)
              : (value ?? '—')}
          </span>
        </div>
      ))}
    </div>
  );
}

export default function ForgeSurface({ onExitToChat }: { onExitToChat?: () => void }) {
  const { t, i18n } = useTranslation();
  const language = (i18n.language || 'en').slice(0, 2) as 'en' | 'si' | 'ta';

  const [section, setSection] = useState<ForgeSectionId>('workspace');
  const [question, setQuestion] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [interpretedQuestion, setInterpretedQuestion] = useState('');
  const [interpreted, setInterpreted] = useState<InterpretPayload | null>(null);
  const [hypotheses, setHypotheses] = useState<Hypothesis[]>([]);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<string | null>(null);
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [busy, setBusy] = useState<'idle' | 'interpreting' | 'running'>('idle');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [evidenceFilter, setEvidenceFilter] = useState<'all' | EvidenceClassification>('all');
  const [catalogue, setCatalogue] = useState<ForgeCatalogue | null>(null);
  const [stored, setStored] = useState<StoredInvestigation[]>(() => listInvestigations());
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCatalogue, setShowCatalogue] = useState(false);

  const refreshHistory = useCallback(() => setStored(listInvestigations()), []);

  useEffect(() => {
    let cancelled = false;
    void fetchCatalogue().then((result) => {
      if (cancelled || !result.ok) return;
      setCatalogue(result.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (section === 'history') refreshHistory();
  }, [section, refreshHistory]);

  const applyInvestigation = useCallback(
    (next: Investigation) => {
      // Preserve the reader's hypothesis decisions across a re-run.
      const mergedHypotheses = next.hypotheses.map((hypothesis) => {
        const local = hypotheses.find((entry) => entry.id === hypothesis.id);
        return local
          ? { ...hypothesis, status: local.status, userStatement: local.userStatement }
          : hypothesis;
      });
      const merged: Investigation = { ...next, hypotheses: mergedHypotheses };
      setInvestigation(merged);
      setHypotheses(mergedHypotheses);
      setSelectedHypothesisId(merged.selectedHypothesisId);
      setInterpreted({
        request: merged.request,
        hypotheses: mergedHypotheses,
        plan: merged.plan,
      });
      setInterpretedQuestion(merged.question);
      const saved = saveInvestigation(merged);
      setNotice(saved.ok ? t('hfSaved') : t('hfNotSaved'));
      refreshHistory();
    },
    [hypotheses, refreshHistory, t],
  );

  const handleInterpret = useCallback(
    async (text?: string) => {
      const value = (text ?? question).trim();
      if (!value || busy !== 'idle') return;
      setBusy('interpreting');
      setError('');
      setNotice('');
      setInvestigation(null);
      const result = await interpretResearch(value, language, null);
      setBusy('idle');
      if (!result.ok) {
        setError(t(ERROR_KEY[result.code] ?? 'hfErrorGeneric'));
        return;
      }
      setQuestion(value);
      setInterpretedQuestion(result.data.request.question);
      setInterpreted(result.data);
      setHypotheses(result.data.hypotheses);
      const preferred =
        result.data.hypotheses.find((hypothesis) => !hypothesis.isNull)?.id ?? null;
      setSelectedHypothesisId(preferred);
      setSection(result.data.hypotheses.length > 0 ? 'hypotheses' : 'data');
    },
    [busy, language, question, t],
  );

  const handleRun = useCallback(
    async (options: { hypothesisId?: string | null; text?: string; context?: ResearchRequest | null } = {}) => {
      const value = (options.text ?? (interpretedQuestion || question)).trim();
      if (!value || busy !== 'idle') return;
      setBusy('running');
      setError('');
      setNotice('');
      const result = await runInvestigation(value, {
        language,
        context: options.context ?? null,
        hypothesisId: options.hypothesisId ?? selectedHypothesisId ?? undefined,
      });
      setBusy('idle');
      if (!result.ok) {
        setError(t(ERROR_KEY[result.code] ?? 'hfErrorGeneric'));
        return;
      }
      applyInvestigation(result.data.investigation);
      setSection('analysis');
    },
    [applyInvestigation, busy, interpretedQuestion, language, question, selectedHypothesisId, t],
  );

  const handleFollowUp = useCallback(async () => {
    const value = followUp.trim();
    if (!value || !investigation) return;
    setFollowUp('');
    await handleRun({ text: value, context: investigation.request });
  }, [followUp, handleRun, investigation]);

  const decide = useCallback(
    (id: string, decision: HypothesisDecision, statement?: string) => {
      setHypotheses((current) => decideHypothesis(current, id, decision, statement));
      setEditing(null);
      if (decision !== 'rejected') setSelectedHypothesisId(id);
    },
    [],
  );

  const openStored = useCallback(
    (id: string) => {
      const entry = getInvestigation(id);
      if (!entry) return;
      const next = entry.investigation;
      setInvestigation(next);
      setHypotheses(next.hypotheses);
      setSelectedHypothesisId(next.selectedHypothesisId);
      setInterpreted({ request: next.request, hypotheses: next.hypotheses, plan: next.plan });
      setInterpretedQuestion(next.question);
      setQuestion(next.question);
      setSection('workspace');
      setNotice('');
    },
    [],
  );

  const removeStored = useCallback(
    (id: string) => {
      deleteInvestigation(id);
      setCompareIds((current) => current.filter((entry) => entry !== id));
      refreshHistory();
      if (investigation?.id === id) setInvestigation(null);
    },
    [investigation, refreshHistory],
  );

  const compare = useMemo(() => {
    if (compareIds.length !== 2) return null;
    const left = stored.find((entry) => entry.id === compareIds[0]);
    const right = stored.find((entry) => entry.id === compareIds[1]);
    if (!left || !right) return null;
    return compareInvestigations(left, right);
  }, [compareIds, stored]);

  const passport = useMemo(
    () => (investigation ? buildPassport(investigation, new Date().toISOString()) : null),
    [investigation],
  );

  const seriesList = useMemo(
    () => (investigation ? investigation.datasets.flatMap((dataset) => dataset.series) : []),
    [investigation],
  );

  const chartOptions = useMemo(() => seriesOptionsFrom(seriesList), [seriesList]);

  const correlationAnalysis = useMemo(
    () =>
      investigation?.analyses.find(
        (analysis) => analysis.method === 'correlation' && !analysis.skipped && (analysis.pairs?.length ?? 0) > 2,
      ),
    [investigation],
  );

  const lagAnalysis = useMemo(
    () => investigation?.analyses.find((analysis) => analysis.method === 'cross-correlation' && !analysis.skipped),
    [investigation],
  );

  const plan = investigation?.plan ?? interpreted?.plan ?? null;
  const request = investigation?.request ?? interpreted?.request ?? null;
  const counterEvidence = investigation?.counterEvidence ?? null;
  const evidenceCounts = useMemo(() => {
    const counts = { supporting: 0, contradicting: 0, neutral: 0, insufficient: 0 };
    for (const item of investigation?.evidence ?? []) {
      if (item.hypothesisIds.length === 0) continue;
      counts[item.classification] += 1;
    }
    return counts;
  }, [investigation]);

  const copyPassport = useCallback(async () => {
    if (!passport) return;
    try {
      await navigator.clipboard.writeText(passportToJson(passport));
      setNotice(t('hfCopied'));
    } catch {
      setNotice(t('hfNotSaved'));
    }
  }, [passport, t]);

  const printPassport = useCallback(() => {
    if (!passport) return;
    const win = window.open('', '_blank', 'noopener,noreferrer');
    if (!win) {
      setNotice(t('hfErrorGeneric'));
      return;
    }
    win.document.write(passportToHtml(passport));
    win.document.close();
    win.focus();
    win.print();
  }, [passport, t]);

  return (
    <div className="forge" role="region" aria-label={t('hfTitle')}>
      <header className="forge-hero">
        <div className="forge-hero__top">
          <span className="forge-hero__badge">
            <FlaskConical size={13} strokeWidth={1.9} aria-hidden="true" />
            {t('hfTitle')}
          </span>
          {onExitToChat ? (
            <button type="button" className="forge-linkbtn" onClick={onExitToChat}>
              <ArrowLeft size={13} strokeWidth={2} aria-hidden="true" />
              {t('hfModeChat')}
            </button>
          ) : null}
        </div>
        <h1 className="forge-hero__title">{t('hfTagline')}</h1>
        <p className="forge-hero__intro">{t('hfIntro')}</p>
        <p className="forge-hero__honesty">
          <Info size={13} strokeWidth={2} aria-hidden="true" />
          {t('hfHonesty')}
        </p>
      </header>

      <div className="forge-tabs" role="tablist" aria-label={t('hfTitle')}>
        {SECTIONS.map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={section === id}
            aria-controls={`forge-panel-${id}`}
            id={`forge-tab-${id}`}
            className={`forge-tab${section === id ? ' is-active' : ''}`}
            onClick={() => setSection(id)}
          >
            {t(SECTION_KEY[id])}
            {id === 'evidence' && investigation ? (
              <span className="forge-tab__count">
                {evidenceCounts.supporting + evidenceCounts.contradicting}
              </span>
            ) : null}
            {id === 'history' && stored.length > 0 ? (
              <span className="forge-tab__count">{stored.length}</span>
            ) : null}
          </button>
        ))}
      </div>

      {error ? (
        <div className="forge-alert forge-alert--error" role="alert">
          <AlertTriangle size={15} strokeWidth={2} aria-hidden="true" />
          <span>{error}</span>
          <button type="button" className="forge-linkbtn" onClick={() => setError('')}>
            {t('hfClose')}
          </button>
        </div>
      ) : null}
      {notice ? (
        <div className="forge-alert forge-alert--info" role="status">
          <CheckCircle2 size={15} strokeWidth={2} aria-hidden="true" />
          <span>{notice}</span>
        </div>
      ) : null}

      <div
        id={`forge-panel-${section}`}
        role="tabpanel"
        aria-labelledby={`forge-tab-${section}`}
        className="forge-body"
      >
        {/* ------------------------------------------------------- workspace */}
        {section === 'workspace' ? (
          <>
            <Section
              title={t('hfQuestionLabel')}
              hint={t('hfHonesty')}
              actions={
                <button
                  type="button"
                  className="forge-btn forge-btn--ghost"
                  onClick={() => {
                    setQuestion('');
                    setInterpreted(null);
                    setInvestigation(null);
                    setHypotheses([]);
                    setSelectedHypothesisId(null);
                    setError('');
                    setNotice('');
                  }}
                >
                  <RefreshCw size={13} strokeWidth={2} aria-hidden="true" />
                  {t('hfNewInvestigation')}
                </button>
              }
            >
              <form
                className="forge-question"
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleInterpret();
                }}
              >
                <label className="sr-only" htmlFor="forge-question">
                  {t('hfQuestionLabel')}
                </label>
                <textarea
                  id="forge-question"
                  className="forge-textarea"
                  rows={3}
                  maxLength={1200}
                  value={question}
                  onChange={(event) => setQuestion(event.target.value)}
                  placeholder={t('hfPlaceholder')}
                />
                <div className="forge-question__actions">
                  <span className="forge-hint">{t('hfEngineNote')}</span>
                  <div className="forge-question__buttons">
                    <button
                      type="submit"
                      className="forge-btn"
                      disabled={busy !== 'idle' || question.trim().length < 8}
                    >
                      {busy === 'interpreting' ? (
                        <Loader2 size={13} className="forge-spin" aria-hidden="true" />
                      ) : (
                        <Sparkles size={13} strokeWidth={2} aria-hidden="true" />
                      )}
                      {busy === 'interpreting' ? t('hfInterpreting') : t('hfInterpret')}
                    </button>
                    <button
                      type="button"
                      className="forge-btn forge-btn--primary"
                      disabled={busy !== 'idle' || !request}
                      onClick={() => void handleRun()}
                    >
                      {busy === 'running' ? (
                        <Loader2 size={13} className="forge-spin" aria-hidden="true" />
                      ) : (
                        <Play size={13} strokeWidth={2} aria-hidden="true" />
                      )}
                      {busy === 'running' ? t('hfRunning') : t('hfRun')}
                    </button>
                  </div>
                </div>
              </form>

              <div className="forge-examples">
                <span className="forge-hint">{t('hfExampleLabel')}</span>
                <div className="forge-examples__row">
                  {(['hfExample1', 'hfExample2', 'hfExample3'] as const).map((key) => (
                    <button
                      key={key}
                      type="button"
                      className="forge-example"
                      onClick={() => {
                        setQuestion(t(key));
                        void handleInterpret(t(key));
                      }}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>

              {investigation ? (
                <form
                  className="forge-followup"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void handleFollowUp();
                  }}
                >
                  <label className="sr-only" htmlFor="forge-followup">
                    {t('hfFollowUp')}
                  </label>
                  <input
                    id="forge-followup"
                    className="forge-input"
                    value={followUp}
                    maxLength={1200}
                    onChange={(event) => setFollowUp(event.target.value)}
                    placeholder={t('hfFollowUpPlaceholder')}
                  />
                  <button
                    type="submit"
                    className="forge-btn"
                    disabled={busy !== 'idle' || followUp.trim().length < 8}
                  >
                    {t('hfFollowUp')}
                  </button>
                </form>
              ) : null}
            </Section>

            {request && plan ? (
              <div className="forge-grid forge-grid--two">
                <Section title={t('hfUnderstood')}>
                  <DefinitionList
                    items={[
                      { label: t('hfQuestion'), value: request.question },
                      { label: t('hfDomain'), value: <code>{request.domain}</code> },
                      { label: t('hfPeriod'), value: request.timeRange.label },
                      { label: t('hfRegion'), value: request.region.name },
                      {
                        label: t('hfVariables'),
                        value:
                          request.variables.map((variable) => variable.id).join(', ') || '—',
                      },
                      {
                        label: t('hfMethods'),
                        value: request.methods.join(', ') || '—',
                      },
                      {
                        label: t('hfInterpretConfidence'),
                        value: t(
                          request.interpretationConfidence === 'high'
                            ? 'hfConfidenceHigh'
                            : request.interpretationConfidence === 'medium'
                              ? 'hfConfidenceMedium'
                              : 'hfConfidenceLow',
                        ),
                      },
                      { label: t('hfObjective'), value: request.objective },
                    ]}
                  />
                  {request.notes.length > 0 ? (
                    <div className="forge-notes">
                      <p className="forge-hint">{t('hfAssumptions')}</p>
                      <ul>
                        {request.notes.map((note) => (
                          <li key={note}>{note}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Section>

                <Section
                  title={t('hfPlanTitle')}
                  actions={
                    <Chip tone={plan.executable ? 'good' : 'bad'}>
                      {plan.executable ? t('hfPlanReady') : t('hfPlanBlocked')}
                    </Chip>
                  }
                >
                  <ul className="forge-planlist">
                    {plan.datasets.map((dataset) => (
                      <li key={dataset.datasetId} className="forge-planlist__item">
                        <div className="forge-planlist__head">
                          <strong>{dataset.title}</strong>
                          <span className="forge-chiprow">
                            <Chip tone={coverageTone(dataset.coverage)}>
                              {t(
                                dataset.coverage === 'in-range'
                                  ? 'hfCoverageIn'
                                  : dataset.coverage === 'partial'
                                    ? 'hfCoveragePartial'
                                    : dataset.coverage === 'out-of-coverage'
                                      ? 'hfCoverageOut'
                                      : 'hfCoverageUnknown',
                              )}
                            </Chip>
                            <Chip tone={dataset.compatible ? 'good' : 'neutral'}>
                              {dataset.compatible ? t('hfCompatible') : dataset.reason}
                            </Chip>
                            {dataset.requiresKey ? (
                              <Chip tone={dataset.keyConfigured ? 'neutral' : 'warn'}>
                                {dataset.keyConfigured ? t('hfKeyReady') : t('hfKeyNeeded')}
                              </Chip>
                            ) : null}
                          </span>
                        </div>
                        <p className="forge-muted">{dataset.coverageDetail}</p>
                        {dataset.units.length > 0 ? (
                          <p className="forge-muted">
                            {t('hfUnits')}: {dataset.units.join(', ')}
                          </p>
                        ) : null}
                        <a
                          className="forge-link"
                          href={dataset.documentationUrl}
                          target="_blank"
                          rel="noreferrer noopener"
                        >
                          <ExternalLink size={11} aria-hidden="true" /> {t('hfDocs')}
                        </a>
                      </li>
                    ))}
                  </ul>
                  {plan.missingInformation.length > 0 ? (
                    <div className="forge-notes">
                      <p className="forge-hint">{t('hfMissingInfo')}</p>
                      <ul>
                        {plan.missingInformation.map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </Section>
              </div>
            ) : (
              <p className="forge-empty">{t('hfNoInvestigation')}</p>
            )}

            {investigation ? (
              <Section
                title={t('hfConclusion')}
                actions={<Chip tone={investigation.conclusion.verdict === 'weakly-supported' ? 'warn' : 'neutral'}>
                  {t(VERDICT_KEY[investigation.conclusion.verdict] ?? 'hfVerdictInsufficient')}
                </Chip>}
              >
                <p className="forge-conclusion__title">{investigation.conclusion.title}</p>
                <p>{investigation.conclusion.summary}</p>
                <div className="forge-chiprow">
                  <Chip tone="good">
                    {t('hfSupporting')}: {investigation.conclusion.supportingCount}
                  </Chip>
                  <Chip tone="bad">
                    {t('hfContradicting')}: {investigation.conclusion.contradictingCount}
                  </Chip>
                  <Chip tone="neutral">
                    {t('hfInsufficient')}: {investigation.conclusion.insufficientCount}
                  </Chip>
                </div>
                <div className="forge-caveat">
                  <ShieldAlert size={15} strokeWidth={2} aria-hidden="true" />
                  <p>{investigation.conclusion.causalCaveat}</p>
                </div>
                <div className="forge-sources">
                  <p className="forge-hint">{t('hfSourcesStatus')}</p>
                  <ul>
                    {investigation.sources.map((source) => (
                      <li key={source.datasetId}>
                        <Chip tone={statusTone(source.status)}>{source.status}</Chip>
                        <span>{source.title}</span>
                        <span className="forge-muted">
                          {source.recordCount} records
                          {source.detail ? ` · ${source.detail}` : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Section>
            ) : null}
          </>
        ) : null}

        {/* ------------------------------------------------------ hypotheses */}
        {section === 'hypotheses' ? (
          <Section title={t('hfTabHypotheses')} hint={t('hfHypothesesHint')}>
            {hypotheses.length === 0 ? (
              <p className="forge-empty">{t('hfNoHypotheses')}</p>
            ) : (
              <ul className="forge-hypotheses">
                {hypotheses.map((hypothesis) => {
                  const statusKey =
                    hypothesis.status === 'accepted'
                      ? 'hfStatusAccepted'
                      : hypothesis.status === 'rejected'
                        ? 'hfStatusRejected'
                        : hypothesis.status === 'edited'
                          ? 'hfStatusEdited'
                          : 'hfStatusProposed';
                  const selected = selectedHypothesisId === hypothesis.id;
                  return (
                    <li
                      key={hypothesis.id}
                      className={`forge-hypothesis${selected ? ' is-selected' : ''}${
                        hypothesis.status === 'rejected' ? ' is-rejected' : ''
                      }`}
                    >
                      <div className="forge-hypothesis__head">
                        <span className="forge-hypothesis__id">{hypothesis.id}</span>
                        <span className="forge-chiprow">
                          {hypothesis.isNull ? <Chip tone="neutral">{t('hfNullHypothesis')}</Chip> : null}
                          <Chip tone={hypothesis.status === 'accepted' ? 'good' : hypothesis.status === 'rejected' ? 'bad' : 'neutral'}>
                            {t(statusKey)}
                          </Chip>
                          {selected ? <Chip tone="info">{t('hfSelected')}</Chip> : null}
                        </span>
                      </div>

                      {editing?.id === hypothesis.id ? (
                        <form
                          className="forge-edit"
                          onSubmit={(event) => {
                            event.preventDefault();
                            decide(hypothesis.id, 'accepted', editing.text);
                          }}
                        >
                          <textarea
                            className="forge-textarea"
                            rows={3}
                            value={editing.text}
                            onChange={(event) => setEditing({ id: hypothesis.id, text: event.target.value })}
                            aria-label={t('hfEdit')}
                          />
                          <div className="forge-edit__actions">
                            <button type="submit" className="forge-btn forge-btn--primary">
                              {t('hfSave')}
                            </button>
                            <button type="button" className="forge-btn forge-btn--ghost" onClick={() => setEditing(null)}>
                              {t('hfCancel')}
                            </button>
                          </div>
                        </form>
                      ) : (
                        <p className="forge-hypothesis__statement">{activeStatement(hypothesis)}</p>
                      )}

                      <p className="forge-muted">{hypothesis.explanation}</p>

                      <div className="forge-hypothesis__grid">
                        <div>
                          <p className="forge-hint">{t('hfIndependent')}</p>
                          <p>{hypothesis.independentVariables.join(', ') || '—'}</p>
                        </div>
                        <div>
                          <p className="forge-hint">{t('hfDependent')}</p>
                          <p>{hypothesis.dependentVariables.join(', ') || '—'}</p>
                        </div>
                        <div>
                          <p className="forge-hint">{t('hfExpectedRelationship')}</p>
                          <p>
                            <code>{hypothesis.expectedRelationship.type}</code>
                            {hypothesis.expectedRelationship.lagHours !== null
                              ? ` · ≤ ${hypothesis.expectedRelationship.lagHours} h`
                              : ''}
                          </p>
                        </div>
                        <div>
                          <p className="forge-hint">{t('hfRequiredObservations')}</p>
                          <p>{hypothesis.requiredObservations.join(' · ') || '—'}</p>
                        </div>
                      </div>

                      <details className="forge-details">
                        <summary>{t('hfFalsification')}</summary>
                        <ul>
                          {hypothesis.falsificationCriteria.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </details>
                      <details className="forge-details">
                        <summary>{t('hfAlternatives')}</summary>
                        <ul>
                          {hypothesis.alternativeExplanations.map((item) => (
                            <li key={item}>{item}</li>
                          ))}
                        </ul>
                      </details>

                      <div className="forge-hypothesis__actions">
                        <button
                          type="button"
                          className="forge-btn forge-btn--ghost"
                          onClick={() => decide(hypothesis.id, 'accepted')}
                        >
                          <CheckCircle2 size={12} aria-hidden="true" /> {t('hfAccept')}
                        </button>
                        <button
                          type="button"
                          className="forge-btn forge-btn--ghost"
                          onClick={() => decide(hypothesis.id, 'rejected')}
                        >
                          <XCircle size={12} aria-hidden="true" /> {t('hfReject')}
                        </button>
                        <button
                          type="button"
                          className="forge-btn forge-btn--ghost"
                          onClick={() => setEditing({ id: hypothesis.id, text: activeStatement(hypothesis) })}
                        >
                          {t('hfEdit')}
                        </button>
                        <button
                          type="button"
                          className="forge-btn forge-btn--primary"
                          disabled={busy !== 'idle' || !interpretedQuestion}
                          onClick={() => {
                            setSelectedHypothesisId(hypothesis.id);
                            void handleRun({ hypothesisId: hypothesis.id, text: interpretedQuestion });
                          }}
                        >
                          {busy === 'running' ? (
                            <Loader2 size={12} className="forge-spin" aria-hidden="true" />
                          ) : (
                            <Play size={12} aria-hidden="true" />
                          )}
                          {t('hfInvestigateThis')}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <p className="forge-hint">{t('hfDecisionNote')}</p>
          </Section>
        ) : null}

        {/* ------------------------------------------------------------ data */}
        {section === 'data' ? (
          <Section
            title={t('hfTabData')}
            hint={plan ? plan.objective : t('hfNoInvestigation')}
            actions={
              <button
                type="button"
                className="forge-btn forge-btn--ghost"
                onClick={() => setShowCatalogue((value) => !value)}
              >
                <Database size={13} aria-hidden="true" /> {t('hfCatalogue')}
              </button>
            }
          >
            {plan ? (
              <div className="forge-tablewrap">
                <table className="forge-table">
                  <caption className="sr-only">{t('hfPlanTitle')}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{t('hfDataset')}</th>
                      <th scope="col">{t('hfOrganisation')}</th>
                      <th scope="col">{t('hfCoverage')}</th>
                      <th scope="col">{t('hfUnits')}</th>
                      <th scope="col">{t('hfDocs')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {plan.datasets.map((dataset) => (
                      <tr key={dataset.datasetId}>
                        <td>
                          <strong>{dataset.title}</strong>
                          <p className="forge-muted">{dataset.reason}</p>
                          <details className="forge-details">
                            <summary>{t('hfExpectedLimitations')}</summary>
                            <ul>
                              {dataset.expectedLimitations.map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </details>
                        </td>
                        <td>{dataset.organisation}</td>
                        <td>
                          <Chip tone={coverageTone(dataset.coverage)}>
                            {t(
                              dataset.coverage === 'in-range'
                                ? 'hfCoverageIn'
                                : dataset.coverage === 'partial'
                                  ? 'hfCoveragePartial'
                                  : dataset.coverage === 'out-of-coverage'
                                    ? 'hfCoverageOut'
                                    : 'hfCoverageUnknown',
                            )}
                          </Chip>
                          <p className="forge-muted">{dataset.coverageDetail}</p>
                        </td>
                        <td>{dataset.units.join(', ') || '—'}</td>
                        <td>
                          <a className="forge-link" href={dataset.documentationUrl} target="_blank" rel="noreferrer noopener">
                            <ExternalLink size={11} aria-hidden="true" /> {t('hfOpenDocumentation')}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="forge-empty">{t('hfNoInvestigation')}</p>
            )}

            {showCatalogue ? (
              <div className="forge-catalogue">
                <p className="forge-hint">{t('hfCatalogueHint')}</p>
                {catalogue ? (
                  <ul>
                    {catalogue.datasets.map((dataset) => (
                      <li key={dataset.id}>
                        <div className="forge-planlist__head">
                          <strong>{dataset.title}</strong>
                          <span className="forge-chiprow">
                            <Chip tone="neutral">{dataset.organisation}</Chip>
                            <Chip tone="neutral">{dataset.access}</Chip>
                          </span>
                        </div>
                        <p className="forge-muted">{dataset.description}</p>
                        <p className="forge-muted">
                          {dataset.coverage.description} · {dataset.cadence}
                        </p>
                        <a className="forge-link" href={dataset.documentationUrl} target="_blank" rel="noreferrer noopener">
                          <ExternalLink size={11} aria-hidden="true" /> {t('hfDocs')}
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="forge-empty">{t('hfLoading')}</p>
                )}
              </div>
            ) : null}
          </Section>
        ) : null}

        {/* -------------------------------------------------------- evidence */}
        {section === 'evidence' ? (
          <Section
            title={t('hfTabEvidence')}
            hint={t('hfEvidenceHint')}
            actions={
              investigation ? (
                <div className="forge-filters" role="group" aria-label={t('hfEvidenceLegend')}>
                  {(['all', 'supporting', 'contradicting', 'neutral', 'insufficient'] as const).map((filter) => (
                    <button
                      key={filter}
                      type="button"
                      className={`forge-filter${evidenceFilter === filter ? ' is-active' : ''}`}
                      aria-pressed={evidenceFilter === filter}
                      onClick={() => setEvidenceFilter(filter)}
                    >
                      {filter === 'all' ? t('hfResults') : t(CLASS_KEY[filter])}
                      {filter !== 'all' ? ` · ${evidenceCounts[filter]}` : ''}
                    </button>
                  ))}
                </div>
              ) : null
            }
          >
            {!investigation ? (
              <p className="forge-empty">{t('hfEvidenceEmpty')}</p>
            ) : (
              <ul className="forge-evidence">
                {investigation.evidence
                  .filter((item) => item.hypothesisIds.length > 0)
                  .filter((item) => evidenceFilter === 'all' || item.classification === evidenceFilter)
                  .map((item) => (
                    <li key={item.id} className={`forge-evidence__item is-${item.classification}`}>
                      <div className="forge-evidence__head">
                        <span className="forge-chiprow">
                          <Chip
                            tone={
                              item.classification === 'supporting'
                                ? 'good'
                                : item.classification === 'contradicting'
                                  ? 'bad'
                                  : item.classification === 'insufficient'
                                    ? 'warn'
                                    : 'neutral'
                            }
                          >
                            {t(CLASS_KEY[item.classification])}
                          </Chip>
                          <Chip tone="neutral">
                            {t('hfStrength')}: {item.strength}
                          </Chip>
                          <Chip tone="neutral">{item.hypothesisIds.join(', ')}</Chip>
                        </span>
                        <span className="forge-mono">{item.id}</span>
                      </div>
                      <p className="forge-evidence__dataset">
                        <strong>{item.datasetTitle}</strong> · {item.organisation}
                      </p>
                      <p className="forge-evidence__rule">{item.rule}</p>
                      <dl className="forge-evidence__meta">
                        <div>
                          <dt>{t('hfMeasurements')}</dt>
                          <dd>
                            {item.measurements} <span className="forge-mono">[{item.units}]</span>
                          </dd>
                        </div>
                        <div>
                          <dt>{t('hfRetrieved')}</dt>
                          <dd className="forge-mono">{item.retrievedAt}</dd>
                        </div>
                        <div>
                          <dt>{t('hfObservationPeriod')}</dt>
                          <dd className="forge-mono">
                            {item.observationStart ?? '—'} → {item.observationEnd ?? '—'}
                          </dd>
                        </div>
                        <div>
                          <dt>{t('hfSource')}</dt>
                          <dd>
                            <a className="forge-link" href={item.sourceUrl} target="_blank" rel="noreferrer noopener">
                              {item.sourceUrl}
                            </a>
                          </dd>
                        </div>
                      </dl>
                      {item.limitations.length > 0 ? (
                        <details className="forge-details">
                          <summary>{t('hfLimitationsTitle')}</summary>
                          <ul>
                            {item.limitations.map((limitation) => (
                              <li key={limitation}>{limitation}</li>
                            ))}
                          </ul>
                        </details>
                      ) : null}
                    </li>
                  ))}
              </ul>
            )}
            {investigation && investigation.evidence.filter((item) => item.hypothesisIds.length > 0).length === 0 ? (
              <p className="forge-empty">{t('hfNoEvidence')}</p>
            ) : null}
          </Section>
        ) : null}

        {/* -------------------------------------------------------- analysis */}
        {section === 'analysis' ? (
          <Section
            title={t('hfTabAnalysis')}
            hint={t('hfAnalysisHint')}
            actions={
              investigation ? (
                <Chip tone="neutral">
                  {investigation.analyses.length} {t('hfResults')}
                </Chip>
              ) : null
            }
          >
            {!investigation ? (
              <p className="forge-empty">{t('hfNoInvestigation')}</p>
            ) : (
              <>
                <div className="forge-analyses">
                  {investigation.analyses.length === 0 ? (
                    <p className="forge-empty">{t('hfNoAnalyses')}</p>
                  ) : (
                    investigation.analyses.map((analysis) => (
                      <article key={analysis.id} className={`forge-analysis${analysis.skipped ? ' is-skipped' : ''}`}>
                        <header className="forge-analysis__head">
                          <div>
                            <h3>{analysis.methodLabel}</h3>
                            <p className="forge-mono">
                              {analysis.datasetRefs.join(' · ')}
                            </p>
                          </div>
                          <span className="forge-chiprow">
                            <Chip tone="neutral">
                              {t('hfSamples')}: {analysis.sampleSize}
                            </Chip>
                            {analysis.skipped ? <Chip tone="warn">{t('hfSkipped')}</Chip> : null}
                          </span>
                        </header>
                        <ResultGrid analysis={analysis} />
                        {analysis.skipReason ? <p className="forge-muted">{analysis.skipReason}</p> : null}
                        <details className="forge-details">
                          <summary>{t('hfAssumptionsLabel')}</summary>
                          <ul>
                            {analysis.assumptions.map((assumption) => (
                              <li key={assumption}>{assumption}</li>
                            ))}
                          </ul>
                        </details>
                        <details className="forge-details">
                          <summary>{t('hfLimitationsTitle')}</summary>
                          <ul>
                            {analysis.limitations.map((limitation) => (
                              <li key={limitation}>{limitation}</li>
                            ))}
                          </ul>
                        </details>
                        <details className="forge-details">
                          <summary>{t('hfMethod')}</summary>
                          <code className="forge-code">{JSON.stringify(analysis.parameters, null, 2)}</code>
                        </details>
                      </article>
                    ))
                  )}
                </div>

                {chartOptions.length > 0 ? (
                  <div className="forge-charts">
                    <TimeSeriesChart
                      options={chartOptions}
                      t={t}
                      language={language}
                      title={t('hfChartTimeline')}
                      hint={t('hfChartTimelineHint')}
                    />
                    {correlationAnalysis?.pairs ? (
                      <RelationshipScatter
                        pairs={correlationAnalysis.pairs}
                        xUnit={correlationAnalysis.inputVariables[0] ?? ''}
                        yUnit={correlationAnalysis.inputVariables[1] ?? ''}
                        t={t}
                        language={language}
                      />
                    ) : null}
                    {lagAnalysis?.series ? (
                      <LagChart points={lagAnalysis.series} t={t} language={language} />
                    ) : null}
                    <div className="forge-grid forge-grid--two">
                      <EvidenceChart evidence={investigation.evidence} t={t} language={language} />
                      <QualityChart seriesList={seriesList} t={t} language={language} />
                    </div>
                  </div>
                ) : null}

                {hypotheses.length > 0 ? (
                  <HypothesisGraph hypotheses={hypotheses} t={t} language={language} />
                ) : null}

                {investigation.imagery.length > 0 ? (
                  <div className="forge-imagery">
                    <h3>{t('hfImagery')}</h3>
                    {investigation.imagery.map((image) => (
                      <figure key={image.layerId}>
                        <img src={image.wmsUrl} alt={`${image.title} — ${image.date}`} loading="lazy" />
                        <figcaption>
                          {image.title} · {image.date} · {image.attribution}
                        </figcaption>
                      </figure>
                    ))}
                    <p className="forge-hint">{t('hfImageryNote')}</p>
                  </div>
                ) : null}
                <p className="forge-hint">{t('hfTechnicalTermsNote')}</p>
              </>
            )}
          </Section>
        ) : null}

        {/* --------------------------------------------------------- counter */}
        {section === 'counter' ? (
          <Section
            title={t('hfTabCounter')}
            hint={t('hfCounterHint')}
            actions={
              counterEvidence ? (
                <Chip
                  tone={
                    counterEvidence.severity === 'high'
                      ? 'bad'
                      : counterEvidence.severity === 'medium'
                        ? 'warn'
                        : 'neutral'
                  }
                >
                  {t('hfSeverity')}: {t(SEVERITY_KEY[counterEvidence.severity])}
                </Chip>
              ) : null
            }
          >
            {!counterEvidence ? (
              <p className="forge-empty">{t('hfNoInvestigation')}</p>
            ) : (
              <ul className="forge-findings">
                {counterEvidence.findings.map((finding) => (
                  <li key={finding.id} className={`forge-finding is-${finding.severity}`}>
                    <div className="forge-finding__head">
                      <span className="forge-chiprow">
                        <Chip tone={finding.severity === 'high' ? 'bad' : finding.severity === 'medium' ? 'warn' : 'neutral'}>
                          {t(SEVERITY_KEY[finding.severity])}
                        </Chip>
                        <Chip tone="neutral">{t(KIND_KEY[finding.kind] ?? 'hfKindAssumption')}</Chip>
                      </span>
                      <span className="forge-mono">{finding.id}</span>
                    </div>
                    <p className="forge-finding__title">{finding.title}</p>
                    <p className="forge-muted">{finding.detail}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        ) : null}

        {/* --------------------------------------------------------- passport */}
        {section === 'passport' ? (
          <Section
            title={t('hfTabPassport')}
            hint={t('hfPassportHint')}
            actions={
              investigation ? (
                <div className="forge-buttonrow">
                  <button
                    type="button"
                    className="forge-btn"
                    onClick={() =>
                      passport &&
                      downloadFile(
                        `${investigation.id}-evidence-passport.json`,
                        passportToJson(passport),
                        'application/json',
                      )
                    }
                  >
                    <FileJson size={13} aria-hidden="true" /> {t('hfDownloadJson')}
                  </button>
                  <button
                    type="button"
                    className="forge-btn"
                    onClick={() =>
                      passport &&
                      downloadFile(
                        `${investigation.id}-evidence-passport.md`,
                        passportToMarkdown(passport),
                        'text/markdown',
                      )
                    }
                  >
                    <Download size={13} aria-hidden="true" /> {t('hfDownloadMarkdown')}
                  </button>
                  <button type="button" className="forge-btn" onClick={printPassport}>
                    <Printer size={13} aria-hidden="true" /> {t('hfPrintPdf')}
                  </button>
                  <button type="button" className="forge-btn forge-btn--ghost" onClick={() => void copyPassport()}>
                    <Copy size={13} aria-hidden="true" /> {t('hfCopyJson')}
                  </button>
                </div>
              ) : null
            }
          >
            {!passport || !investigation ? (
              <p className="forge-empty">{t('hfPassportNeedsInvestigation')}</p>
            ) : (
              <>
                <div className="forge-passport">
                  <div className="forge-passport__head">
                    <div>
                      <p className="forge-hint">{t('hfPassportReady')}</p>
                      <h3>{passport.investigationId}</h3>
                      <p className="forge-mono">{passport.generatedAt}</p>
                    </div>
                    <Chip tone="warn">
                      {t(VERDICT_KEY[passport.conclusion.verdict] ?? 'hfVerdictInsufficient')}
                    </Chip>
                  </div>
                  <DefinitionList
                    items={[
                      { label: t('hfQuestion'), value: passport.researchQuestion },
                      { label: t('hfPeriod'), value: passport.timeWindow.label },
                      { label: t('hfRegion'), value: passport.region.name },
                      {
                        label: t('hfContributingSources'),
                        value: passport.dataSources
                          .map((source) => `${source.datasetId} (${source.status})`)
                          .join(' · '),
                      },
                      {
                        label: t('hfSupporting'),
                        value: `${passport.conclusion.counts.supporting} · ${t('hfContradicting')}: ${
                          passport.conclusion.counts.contradicting
                        } · ${t('hfInsufficient')}: ${passport.conclusion.counts.insufficient}`,
                      },
                    ]}
                  />
                  <p className="forge-caveat">
                    <Info size={14} aria-hidden="true" />
                    <span>{passport.disclaimer}</span>
                  </p>
                  <details className="forge-details">
                    <summary>{t('hfVerification')}</summary>
                    <pre className="forge-code">{JSON.stringify(passport.reproducibility, null, 2)}</pre>
                  </details>
                </div>
                <p className="forge-hint">{t('hfPassportDisclaimer')}</p>
              </>
            )}
          </Section>
        ) : null}

        {/* ---------------------------------------------------------- history */}
        {section === 'history' ? (
          <Section
            title={t('hfTabHistory')}
            hint={t('hfHistoryHint')}
            actions={
              <div className="forge-buttonrow">
                <button
                  type="button"
                  className="forge-btn forge-btn--ghost"
                  disabled={stored.length === 0}
                  onClick={() => downloadFile('nova-forge-history.json', exportMemoryJson(), 'application/json')}
                >
                  <Download size={13} aria-hidden="true" /> {t('hfExportHistory')}
                </button>
                <button
                  type="button"
                  className="forge-btn forge-btn--ghost"
                  disabled={stored.length === 0}
                  onClick={() => {
                    clearMemory();
                    setCompareIds([]);
                    refreshHistory();
                    setInvestigation(null);
                  }}
                >
                  <Trash2 size={13} aria-hidden="true" /> {t('hfClearAll')}
                </button>
              </div>
            }
          >
            {stored.length === 0 ? (
              <p className="forge-empty">{t('hfHistoryEmpty')}</p>
            ) : (
              <ul className="forge-history">
                {stored.map((entry) => (
                  <li key={entry.id} className="forge-history__item">
                    <label className="forge-check">
                      <input
                        type="checkbox"
                        checked={compareIds.includes(entry.id)}
                        onChange={() =>
                          setCompareIds((current) =>
                            current.includes(entry.id)
                              ? current.filter((id) => id !== entry.id)
                              : [...current, entry.id].slice(-2),
                          )
                        }
                        aria-label={`${t('hfCompare')} ${entry.id}`}
                      />
                      <span />
                    </label>
                    <div className="forge-history__body">
                      <p className="forge-history__question">{entry.question}</p>
                      <p className="forge-mono">
                        {entry.id} · {entry.createdAt} · {entry.domain}
                      </p>
                      <div className="forge-chiprow">
                        <Chip tone="neutral">{t(VERDICT_KEY[entry.verdict] ?? 'hfVerdictInsufficient')}</Chip>
                        {entry.datasetIds.map((id) => (
                          <Chip key={id} tone="neutral">
                            {id}
                          </Chip>
                        ))}
                      </div>
                    </div>
                    <div className="forge-history__actions">
                      <button type="button" className="forge-btn forge-btn--ghost" onClick={() => openStored(entry.id)}>
                        <History size={12} aria-hidden="true" /> {t('hfOpen')}
                      </button>
                      <button type="button" className="forge-btn forge-btn--ghost" onClick={() => removeStored(entry.id)}>
                        <Trash2 size={12} aria-hidden="true" /> {t('hfDelete')}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <p className="forge-hint">{t('hfCompareHint')}</p>

            {compare ? (
              <div className="forge-compare">
                <h3>
                  <Layers size={14} aria-hidden="true" /> {t('hfCompare')}
                </h3>
                <DefinitionList
                  items={[
                    {
                      label: t('hfComparable'),
                      value: (
                        <Chip tone={compare.directlyComparable ? 'good' : 'warn'}>
                          {compare.directlyComparable ? t('hfComparable') : t('hfNotComparable')}
                        </Chip>
                      ),
                    },
                    { label: t('hfQuestion'), value: compare.sameQuestion ? '✓' : '—' },
                    { label: t('hfDomain'), value: compare.sameDomain ? '✓' : '—' },
                    { label: t('hfPeriod'), value: compare.samePeriod ? '✓' : '—' },
                    { label: t('hfSharedDatasets'), value: compare.sharedDatasets.join(', ') || '—' },
                    { label: t('hfOnlyLeft'), value: compare.onlyLeft.join(', ') || '—' },
                    { label: t('hfOnlyRight'), value: compare.onlyRight.join(', ') || '—' },
                    {
                      label: t('hfVerdict'),
                      value: `${compare.verdicts.left} / ${compare.verdicts.right}`,
                    },
                    { label: t('hfNoteLabel'), value: compare.note },
                  ]}
                />
              </div>
            ) : null}
          </Section>
        ) : null}
      </div>

      <footer className="forge-footer">
        <span>
          <Microscope size={12} aria-hidden="true" /> {t('hfEngineNote')}
        </span>
        <span>
          <Activity size={12} aria-hidden="true" /> {investigation ? investigation.id : '—'}
        </span>
        <span>
          <Database size={12} aria-hidden="true" /> NASA · NOAA · GIBS
        </span>
      </footer>
    </div>
  );
}
