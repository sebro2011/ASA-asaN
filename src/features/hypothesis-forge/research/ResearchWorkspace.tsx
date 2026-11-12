/**
 * NOVA Forge — Research Workspace.
 *
 * The user-facing layer over the research models from PR #46. It is a section
 * inside the existing Forge surface, not a route and not a second application:
 * navigation, AI infrastructure, storage and the scientific engines are the ones
 * that already exist.
 *
 * Layout decisions that matter:
 *  - the split between the project list and the detail pane is a real, resizable
 *    separator (pointer drag + arrow keys), and the width is remembered;
 *  - full-screen mode is an in-app overlay that owns its own scrolling — the
 *    document remains the scroll owner everywhere else;
 *  - below 900 px the list becomes a native `<select>` picker, because a drawer
 *    that traps focus on a tablet is worse than a picker that does not;
 *  - the tab strip keeps the roving-tabindex contract the Forge already uses.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Archive, ChevronLeft, ChevronRight, Maximize2, Minimize2, Plus, Trash2 } from 'lucide-react';
import { DISCIPLINES, summariseProject, type Discipline, type ResearchProject } from '../../../lib/forge/research/project';
import { useBodyScrollLock, useEscape } from '../../../app/hooks';
import type { LanguageCode } from '../../../lib/forge/types';
import { useResearchProjects } from './useResearchProjects';
import { ProjectOverviewPanel } from './ProjectOverviewPanel';
import { HypothesisPanel } from './HypothesisPanel';
import { EvidencePanel } from './EvidencePanel';
import { VersionsPanel } from './VersionsPanel';
import { AnalysisPanel } from './AnalysisPanel';
import { AssistantPanel } from './AssistantPanel';
import { Badge, Labeled, Select, TextInput } from './controls';

const TABS = ['overview', 'hypotheses', 'evidence', 'versions', 'analysis', 'assistant'] as const;
type Tab = (typeof TABS)[number];

const TAB_KEYS: Record<Tab, string> = {
  overview: 'frOverview',
  hypotheses: 'frHypotheses',
  evidence: 'frEvidence',
  versions: 'frVersions',
  analysis: 'frAnalysis',
  assistant: 'frAssistant',
};

const NAV_WIDTH_KEY = 'nova_forge_research_nav_width';
const MIN_NAV = 180;
const MAX_NAV = 420;
const COLLAPSED_NAV = 76;
const KEYBOARD_STEP = 16;

function readNavWidth(): number {
  try {
    const stored = Number(window.localStorage.getItem(NAV_WIDTH_KEY));
    if (Number.isFinite(stored) && stored >= MIN_NAV && stored <= MAX_NAV) return stored;
  } catch {
    /* storage is optional here */
  }
  return 264;
}

export function ResearchWorkspace() {
  const { t } = useTranslation();
  const api = useResearchProjects();
  const [tab, setTab] = useState<Tab>('overview');
  const [navCollapsed, setNavCollapsed] = useState(false);
  const [navWidth, setNavWidth] = useState<number>(() => readNavWidth());
  const [fullscreen, setFullscreen] = useState(false);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [draftTitle, setDraftTitle] = useState('');
  const [draftDiscipline, setDraftDiscipline] = useState<Discipline>('interdisciplinary');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showArchived, setShowArchived] = useState(false);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const tablistRef = useRef<HTMLDivElement | null>(null);
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  useBodyScrollLock(fullscreen);
  useEscape(fullscreen, useCallback(() => setFullscreen(false), []));

  useEffect(() => {
    try {
      window.localStorage.setItem(NAV_WIDTH_KEY, String(navWidth));
    } catch {
      /* remembering the width is a convenience, not a requirement */
    }
  }, [navWidth]);

  // Keep the assistant's context pointing at a hypothesis that still exists.
  useEffect(() => {
    if (api.active && selectedHypothesisId && !api.active.hypotheses.some((entry) => entry.id === selectedHypothesisId)) {
      setSelectedHypothesisId(null);
    }
  }, [api.active, selectedHypothesisId]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (navCollapsed) return;
    drag.current = { startX: event.clientX, startWidth: navWidth };
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const next = drag.current.startWidth + (event.clientX - drag.current.startX);
    setNavWidth(Math.min(MAX_NAV, Math.max(MIN_NAV, Math.round(next))));
  };

  const endDrag = () => {
    drag.current = null;
  };

  const onResizerKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (navCollapsed) return;
    let next: number | null = null;
    if (event.key === 'ArrowLeft') next = navWidth - KEYBOARD_STEP;
    if (event.key === 'ArrowRight') next = navWidth + KEYBOARD_STEP;
    if (event.key === 'Home') next = MIN_NAV;
    if (event.key === 'End') next = MAX_NAV;
    if (next === null) return;
    event.preventDefault();
    setNavWidth(Math.min(MAX_NAV, Math.max(MIN_NAV, next)));
  };

  const onTabKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const index = TABS.indexOf(tab);
    let nextIndex: number | null = null;
    if (event.key === 'ArrowRight') nextIndex = (index + 1) % TABS.length;
    if (event.key === 'ArrowLeft') nextIndex = (index - 1 + TABS.length) % TABS.length;
    if (event.key === 'Home') nextIndex = 0;
    if (event.key === 'End') nextIndex = TABS.length - 1;
    if (nextIndex === null) return;
    event.preventDefault();
    const next = TABS[nextIndex];
    setTab(next);
    const node = tablistRef.current?.querySelector<HTMLButtonElement>(`#fr-tab-${next}`);
    node?.focus();
  };

  const visible = api.projects.filter((project) => (showArchived ? true : project.archivedAt === null));
  const active = api.active;

  const saveBadge =
    api.saveState === 'saved'
      ? { tone: 'ok' as const, label: t('frSaved') }
      : api.saveState === 'saving'
        ? { tone: 'neutral' as const, label: t('frSaving') }
        : { tone: 'bad' as const, label: t('frSaveFailed') };

  const shellStyle = {
    ['--fr-nav-width' as string]: `${navCollapsed ? COLLAPSED_NAV : navWidth}px`,
  } as React.CSSProperties;

  return (
    <div
      className={`fr-workspace${fullscreen ? ' fr-workspace--full' : ''}`}
      style={shellStyle}
      ref={shellRef}
      data-fullscreen={fullscreen ? 'true' : 'false'}
    >
      <header className="fr-workspace__head">
        <div className="fr-workspace__titles">
          <h3>{t('frTitle')}</h3>
          <p>{t('frSubtitle')}</p>
        </div>
        <div className="fr-workspace__controls">
          <Badge tone={saveBadge.tone}>{saveBadge.label}</Badge>
          <button
            type="button"
            className="fr-iconbtn"
            aria-pressed={navCollapsed}
            aria-label={navCollapsed ? t('frExpand') : t('frCollapse')}
            title={navCollapsed ? t('frExpand') : t('frCollapse')}
            onClick={() => setNavCollapsed((value) => !value)}
          >
            {navCollapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
          </button>
          <button
            type="button"
            className="fr-iconbtn"
            aria-pressed={fullscreen}
            aria-label={fullscreen ? t('frExitFullscreen') : t('frFullscreen')}
            title={fullscreen ? t('frExitFullscreen') : t('frFullscreen')}
            onClick={() => setFullscreen((value) => !value)}
          >
            {fullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
          </button>
        </div>
      </header>

      {!api.storageAvailable ? (
        <p className="fr-alert fr-alert--bad" role="alert">
          {t('frStorageUnavailable')}
        </p>
      ) : null}

      {api.recovery ? (
        <div className="fr-alert fr-alert--warn" role="status">
          <span>
            {t('frDraftFound')}{' '}
            <strong>{api.recovery.project.title || t('frUntitled')}</strong>{' '}
            <span className="fr-mono">{new Date(api.recovery.savedAt).toLocaleString()}</span>
          </span>
          <button type="button" className="fr-btn fr-btn--primary" onClick={api.openRecovery}>
            {t('frRestoreDraft')}
          </button>
          <button type="button" className="fr-btn fr-btn--ghost" onClick={api.discardRecovery}>
            {t('frDiscardDraft')}
          </button>
        </div>
      ) : null}

      <div className="fr-workspace__body">
        <aside className="fr-nav" aria-label={t('frTitle')} data-collapsed={navCollapsed ? 'true' : 'false'}>
          <button type="button" className="fr-btn fr-btn--primary fr-nav__new" onClick={() => setCreating(true)}>
            <Plus size={14} aria-hidden /> {!navCollapsed ? t('frNew') : null}
          </button>

          {creating ? (
            <div className="fr-nav__create">
              <Labeled label={t('frProjectName')}>
                <TextInput value={draftTitle} onChange={setDraftTitle} />
              </Labeled>
              <Labeled label={t('frDiscipline')}>
                <Select
                  value={draftDiscipline}
                  onChange={setDraftDiscipline}
                  options={DISCIPLINES.map((discipline) => ({ value: discipline, label: discipline }))}
                />
              </Labeled>
              <div className="fr-actions">
                <button
                  type="button"
                  className="fr-btn fr-btn--primary"
                  onClick={() => {
                    if (!draftTitle.trim()) return;
                    const created = api.create({
                      title: draftTitle,
                      discipline: draftDiscipline,
                      language: (document.documentElement.lang as LanguageCode) || 'en',
                    });
                    setDraftTitle('');
                    setCreating(false);
                    setTab('overview');
                    setSelectedHypothesisId(null);
                    void created;
                  }}
                >
                  {t('frCreate')}
                </button>
                <button type="button" className="fr-btn fr-btn--ghost" onClick={() => setCreating(false)}>
                  {t('frCancel')}
                </button>
              </div>
            </div>
          ) : null}

          <label className="fr-check fr-nav__filter">
            <input type="checkbox" checked={showArchived} onChange={(event) => setShowArchived(event.target.checked)} />
            <span>{t('frArchive')}</span>
          </label>

          {/* Compact picker for tablet/mobile; the list below is for desktop. */}
          <div className="fr-nav__picker">
            <Select
              value={api.activeId ?? ''}
              onChange={(id) => api.select(id || null)}
              options={[
                { value: '', label: '—' },
                ...visible.map((project) => ({ value: project.id, label: project.title })),
              ]}
            />
          </div>

          <ul className="fr-nav__list">
            {visible.map((project) => {
              const summary = summariseProject(project);
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    className={`fr-nav__item${project.id === api.activeId ? ' is-active' : ''}`}
                    aria-current={project.id === api.activeId ? 'true' : undefined}
                    onClick={() => {
                      api.select(project.id);
                      setSelectedHypothesisId(null);
                    }}
                    title={project.title}
                  >
                    <span className="fr-nav__name">{navCollapsed ? project.title.slice(0, 1).toUpperCase() : project.title}</span>
                    {!navCollapsed ? (
                      <span className="fr-nav__meta">
                        {summary.hypothesisCount} H · {summary.evidenceCount} E
                        {project.archivedAt ? ' · archived' : ''}
                      </span>
                    ) : null}
                  </button>
                  {!navCollapsed && project.id === api.activeId ? (
                    <div className="fr-nav__actions">
                      <button
                        type="button"
                        className="fr-btn fr-btn--ghost"
                        onClick={() => (project.archivedAt ? api.unarchive(project.id) : api.archive(project.id))}
                      >
                        <Archive size={13} aria-hidden /> {project.archivedAt ? t('frUnarchive') : t('frArchive')}
                      </button>
                      {confirmDelete === project.id ? (
                        <>
                          <button type="button" className="fr-btn fr-btn--danger" onClick={() => api.remove(project.id)}>
                            {t('frDelete')}
                          </button>
                          <button type="button" className="fr-btn fr-btn--ghost" onClick={() => setConfirmDelete(null)}>
                            {t('frCancel')}
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          className="fr-btn fr-btn--ghost"
                          onClick={() => setConfirmDelete(project.id)}
                          aria-label={t('frDelete')}
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      )}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {visible.length === 0 ? <p className="fr-nav__empty">{t('frNoProjects')}</p> : null}
        </aside>

        <div
          className="fr-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label={t('frResizeHint')}
          aria-valuemin={MIN_NAV}
          aria-valuemax={MAX_NAV}
          aria-valuenow={navCollapsed ? COLLAPSED_NAV : navWidth}
          aria-disabled={navCollapsed ? 'true' : 'false'}
          tabIndex={navCollapsed ? -1 : 0}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
          onKeyDown={onResizerKeyDown}
          title={t('frResizeHint')}
        >
          <span aria-hidden />
        </div>

        <section className="fr-main" aria-label={t('frTitle')}>
          {!active ? (
            <div className="fr-main__empty">
              <h4>{t('frNoProjects')}</h4>
              <p>{t('frNoProjectsBody')}</p>
            </div>
          ) : (
            <>
              <div className="fr-tabs" role="tablist" aria-label={t('frTitle')} ref={tablistRef} onKeyDown={onTabKeyDown}>
                {TABS.map((entry) => (
                  <button
                    key={entry}
                    id={`fr-tab-${entry}`}
                    type="button"
                    role="tab"
                    aria-selected={tab === entry}
                    aria-controls={tab === entry ? `fr-panel-${entry}` : undefined}
                    tabIndex={tab === entry ? 0 : -1}
                    className={`fr-tabs__tab${tab === entry ? ' is-active' : ''}`}
                    onClick={() => setTab(entry)}
                  >
                    {t(TAB_KEYS[entry])}
                  </button>
                ))}
              </div>

              <div
                id={`fr-panel-${tab}`}
                role="tabpanel"
                aria-labelledby={`fr-tab-${tab}`}
                className="fr-main__panel"
                tabIndex={0}
              >
                {tab === 'overview' ? <ProjectOverviewPanel project={active} update={api.update} t={t} /> : null}
                {tab === 'hypotheses' ? (
                  <HypothesisPanel
                    project={active}
                    update={api.update}
                    t={t}
                    selectedId={selectedHypothesisId}
                    onSelect={setSelectedHypothesisId}
                  />
                ) : null}
                {tab === 'evidence' ? <EvidencePanel project={active} update={api.update} t={t} /> : null}
                {tab === 'versions' ? (
                  <VersionsPanel project={active} commit={api.commit} restore={api.restore} t={t} />
                ) : null}
                {tab === 'analysis' ? <AnalysisPanel project={active} update={api.update} t={t} /> : null}
                {tab === 'assistant' ? (
                  <AssistantPanel project={active} selectedHypothesisId={selectedHypothesisId} t={t} />
                ) : null}
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}

export type { ResearchProject };
