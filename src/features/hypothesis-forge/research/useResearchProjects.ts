/**
 * Research-project state, autosave and recovery.
 *
 * One hook owns every transition so the panels stay declarative, and so the
 * persistence rules live in exactly one place:
 *
 *  - every mutation writes a draft immediately and the store on a short debounce,
 *    so a crash mid-typing loses at most a quarter of a second;
 *  - storage failures are reported as a state (`storage-unavailable` / `error`),
 *    never swallowed;
 *  - a draft from a previous session is offered for recovery, never applied
 *    silently — the user decides whether to open it;
 *  - nothing here recalculates: a restore returns the stored snapshot as it was.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  archiveProject,
  commitVersion,
  projectHash,
  deleteProject as deleteProjectFromStore,
  emptyProject,
  clearDraft,
  readDraft,
  readProjects,
  restoreVersion,
  saveDraft,
  saveProject,
  unarchiveProject,
  type Discipline,
  type DraftEnvelope,
  type ResearchProject,
} from '../../../lib/forge/research/project';
import type { LanguageCode } from '../../../lib/forge/types';

export type SaveState = 'saved' | 'saving' | 'error' | 'storage-unavailable';

const SAVE_DEBOUNCE_MS = 250;

export interface ResearchProjectsApi {
  projects: ResearchProject[];
  activeId: string | null;
  active: ResearchProject | null;
  saveState: SaveState;
  recovery: DraftEnvelope | null;
  create: (input: { title: string; discipline: Discipline; language: LanguageCode }) => ResearchProject;
  select: (id: string | null) => void;
  update: (mutate: (project: ResearchProject) => ResearchProject) => void;
  commit: (label: string) => void;
  restore: (versionId: string) => string;
  archive: (id: string) => void;
  unarchive: (id: string) => void;
  remove: (id: string) => void;
  openRecovery: () => void;
  discardRecovery: () => void;
  /** Forces the pending debounced write, e.g. on unmount or before a commit. */
  flush: () => void;
  storageAvailable: boolean;
}

export function useResearchProjects(): ResearchProjectsApi {
  const [projects, setProjects] = useState<ResearchProject[]>(() => readProjects().projects);
  const [activeId, setActiveId] = useState<string | null>(() => {
    const stored = readProjects().projects;
    return stored.find((project) => project.archivedAt === null)?.id ?? stored[0]?.id ?? null;
  });
  const [saveState, setSaveState] = useState<SaveState>('saved');
  const [recovery, setRecovery] = useState<DraftEnvelope | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<ResearchProject | null>(null);
  // React state updaters may run later (or twice), so imperative actions that
  // must *return* a result read from this ref instead of from a setState body.
  const latest = useRef<ResearchProject[]>(projects);
  latest.current = projects;

  const storageAvailable = useMemo(() => {
    try {
      return typeof window !== 'undefined' && Boolean(window.localStorage);
    } catch {
      return false;
    }
  }, []);

  // Offer a recovered draft once, on mount.
  useEffect(() => {
    const draft = readDraft();
    if (!draft) return;
    const stored = readProjects().projects.find((project) => project.id === draft.projectId);
    if (!stored) {
      // The project was deleted after the draft was written: the draft is the
      // only copy, so it is still worth offering.
      setRecovery(draft);
      return;
    }
    // Compare content, not timestamps: an edit can leave `updatedAt` alone, and a
    // clock change can make untouched copies look different. Only a draft whose
    // content differs from what is stored is worth offering.
    if (projectHash(stored) !== draft.contentHash) setRecovery(draft);
  }, []);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      if (pending.current) saveProject(pending.current);
    },
    [],
  );

  const flush = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!pending.current) return;
    const project = pending.current;
    pending.current = null;
    const result = saveProject(project);
    setProjects(result.projects);
    if (result.ok) clearDraft();
    setSaveState(result.ok ? 'saved' : result.reason === 'storage-unavailable' ? 'storage-unavailable' : 'error');
  }, []);

  const schedule = useCallback(
    (project: ResearchProject) => {
      if (!storageAvailable) {
        setSaveState('storage-unavailable');
        return;
      }
      setSaveState('saving');
      const draft = saveDraft(project);
      if (!draft.ok) {
        setSaveState(draft.reason === 'storage-unavailable' ? 'storage-unavailable' : 'error');
        return;
      }
      pending.current = project;
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(flush, SAVE_DEBOUNCE_MS);
    },
    [flush, storageAvailable],
  );

  const active = useMemo(() => projects.find((project) => project.id === activeId) ?? null, [projects, activeId]);

  const create = useCallback(
    (input: { title: string; discipline: Discipline; language: LanguageCode }) => {
      const project = emptyProject(input);
      const result = saveProject(project);
      setProjects(result.projects);
      setActiveId(project.id);
      setSaveState(result.ok ? 'saved' : result.reason === 'storage-unavailable' ? 'storage-unavailable' : 'error');
      return result.projects.find((entry) => entry.id === project.id) ?? project;
    },
    [],
  );

  const update = useCallback(
    (mutate: (project: ResearchProject) => ResearchProject) => {
      setProjects((previous) => {
        const current = previous.find((project) => project.id === activeId);
        if (!current) return previous;
        const next = mutate(current);
        schedule(next);
        return previous.map((project) => (project.id === next.id ? next : project));
      });
    },
    [activeId, schedule],
  );

  const commit = useCallback(
    (label: string) => {
      update((project) => commitVersion(project, label));
      // A version is a deliberate action: write it through immediately.
      flush();
    },
    [flush, update],
  );

  const restore = useCallback(
    (versionId: string): string => {
      const current = latest.current.find((project) => project.id === activeId);
      if (!current) return 'Unknown version id.';
      const result = restoreVersion(current, versionId);
      if (!result.project) return result.reason;
      const next = result.project;
      // Restoring is a deliberate action: write it through and drop any queued
      // edit that would otherwise overwrite it a quarter of a second later.
      if (timer.current) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      pending.current = null;
      setProjects((previous) => previous.map((project) => (project.id === next.id ? next : project)));
      const saved = saveProject(next);
      setSaveState(saved.ok ? 'saved' : saved.reason === 'storage-unavailable' ? 'storage-unavailable' : 'error');
      clearDraft();
      return result.reason;
    },
    [activeId],
  );

  const archive = useCallback(
    (id: string) => {
      setProjects((previous) => {
        const next = previous.map((project) => (project.id === id ? archiveProject(project) : project));
        const target = next.find((project) => project.id === id);
        if (target) saveProject(target);
        return next;
      });
    },
    [],
  );

  const unarchive = useCallback(
    (id: string) => {
      setProjects((previous) => {
        const next = previous.map((project) => (project.id === id ? unarchiveProject(project) : project));
        const target = next.find((project) => project.id === id);
        if (target) saveProject(target);
        return next;
      });
    },
    [],
  );

  const remove = useCallback(
    (id: string) => {
      const result = deleteProjectFromStore(id);
      setProjects(result.projects);
      setActiveId((current) => (current === id ? result.projects[0]?.id ?? null : current));
    },
    [],
  );

  const openRecovery = useCallback(() => {
    if (!recovery) return;
    const project = recovery.project;
    const result = saveProject(project);
    setProjects(result.projects);
    setActiveId(project.id);
    setRecovery(null);
    clearDraft();
  }, [recovery]);

  const discardRecovery = useCallback(() => {
    setRecovery(null);
    clearDraft();
  }, []);

  return {
    projects,
    activeId,
    active,
    saveState,
    recovery,
    create,
    select: setActiveId,
    update,
    commit,
    restore,
    archive,
    unarchive,
    remove,
    openRecovery,
    discardRecovery,
    flush,
    storageAvailable,
  };
}
