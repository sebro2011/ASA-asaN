/**
 * NOVA HYPOTHESIS FORGE — scientific memory.
 *
 * Investigations are stored on the reader's own device (localStorage), versioned
 * and capped. Nothing is uploaded, nothing leaves the browser, and a blocked or
 * full storage API degrades to "not saved" instead of pretending otherwise.
 *
 * The Supabase schema is deliberately untouched: adding a table would require a
 * migration this feature cannot verify against the live project.
 */

import type { Investigation, LanguageCode } from './types';

export const FORGE_MEMORY_KEY = 'nova_forge_memory_v1';
export const MEMORY_VERSION = 1;
export const MAX_STORED_INVESTIGATIONS = 12;

export interface StoredInvestigation {
  id: string;
  question: string;
  language: LanguageCode;
  domain: string;
  createdAt: string;
  verdict: string;
  hypothesis: string;
  datasetIds: string[];
  investigation: Investigation;
}

export interface ForgeMemory {
  version: number;
  investigations: StoredInvestigation[];
}

function storage(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null;
  }
}

function empty(): ForgeMemory {
  return { version: MEMORY_VERSION, investigations: [] };
}

function isStored(value: unknown): value is StoredInvestigation {
  if (!value || typeof value !== 'object') return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string' &&
    typeof record.question === 'string' &&
    typeof record.createdAt === 'string' &&
    typeof record.investigation === 'object' &&
    record.investigation !== null
  );
}

export function readMemory(): ForgeMemory {
  const store = storage();
  if (!store) return empty();
  try {
    const raw = store.getItem(FORGE_MEMORY_KEY);
    if (!raw) return empty();
    const parsed = JSON.parse(raw) as Partial<ForgeMemory>;
    if (!parsed || parsed.version !== MEMORY_VERSION || !Array.isArray(parsed.investigations)) {
      return empty();
    }
    return {
      version: MEMORY_VERSION,
      investigations: parsed.investigations.filter(isStored).slice(0, MAX_STORED_INVESTIGATIONS),
    };
  } catch {
    return empty();
  }
}

function write(memory: ForgeMemory): { ok: boolean; reason?: string } {
  const store = storage();
  if (!store) return { ok: false, reason: 'storage-unavailable' };
  try {
    store.setItem(
      FORGE_MEMORY_KEY,
      JSON.stringify({
        version: MEMORY_VERSION,
        investigations: memory.investigations.slice(0, MAX_STORED_INVESTIGATIONS),
      }),
    );
    return { ok: true };
  } catch {
    // Quota exceeded: try to keep the four most recent rather than losing all.
    try {
      store.setItem(
        FORGE_MEMORY_KEY,
        JSON.stringify({
          version: MEMORY_VERSION,
          investigations: memory.investigations.slice(0, 4),
        }),
      );
      return { ok: true, reason: 'trimmed-to-four' };
    } catch {
      return { ok: false, reason: 'quota-exceeded' };
    }
  }
}

export function toStored(investigation: Investigation): StoredInvestigation {
  const selected =
    investigation.hypotheses.find((hypothesis) => hypothesis.id === investigation.selectedHypothesisId) ??
    investigation.hypotheses[0] ??
    null;
  return {
    id: investigation.id,
    question: investigation.question,
    language: investigation.language,
    domain: investigation.request.domain,
    createdAt: investigation.createdAt,
    verdict: investigation.conclusion.verdict,
    hypothesis: selected ? selected.userStatement || selected.statement : '',
    datasetIds: investigation.datasets.map((dataset) => dataset.datasetId),
    investigation,
  };
}

export function saveInvestigation(
  investigation: Investigation,
): { ok: boolean; reason?: string; stored: StoredInvestigation[] } {
  const memory = readMemory();
  const entry = toStored(investigation);
  const next = [entry, ...memory.investigations.filter((item) => item.id !== entry.id)].slice(
    0,
    MAX_STORED_INVESTIGATIONS,
  );
  const result = write({ version: MEMORY_VERSION, investigations: next });
  return { ...result, stored: result.ok ? next : memory.investigations };
}

export function listInvestigations(): StoredInvestigation[] {
  return readMemory().investigations.slice().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getInvestigation(id: string): StoredInvestigation | null {
  return readMemory().investigations.find((entry) => entry.id === id) ?? null;
}

export function deleteInvestigation(id: string): { ok: boolean; stored: StoredInvestigation[] } {
  const memory = readMemory();
  const next = memory.investigations.filter((entry) => entry.id !== id);
  const result = write({ version: MEMORY_VERSION, investigations: next });
  return { ok: result.ok, stored: next };
}

export function clearMemory(): { ok: boolean } {
  const store = storage();
  if (!store) return { ok: false };
  try {
    store.removeItem(FORGE_MEMORY_KEY);
    return { ok: true };
  } catch {
    return { ok: false };
  }
}

export function exportMemoryJson(): string {
  return JSON.stringify(
    {
      schema: 'nova-hypothesis-forge-memory/1',
      exportedAt: new Date().toISOString(),
      investigations: readMemory().investigations.map((entry) => entry.investigation),
    },
    null,
    2,
  );
}

export interface InvestigationComparison {
  leftId: string;
  rightId: string;
  sameQuestion: boolean;
  sameDomain: boolean;
  samePeriod: boolean;
  sharedDatasets: string[];
  onlyLeft: string[];
  onlyRight: string[];
  verdicts: { left: string; right: string };
  hypothesisStatements: { left: string; right: string };
  /** True when the two runs used an identical request and can be compared statistically. */
  directlyComparable: boolean;
  note: string;
}

/** Compare two stored investigations without implying either is more correct. */
export function compareInvestigations(
  left: StoredInvestigation,
  right: StoredInvestigation,
): InvestigationComparison {
  const leftDatasets = new Set(left.datasetIds);
  const rightDatasets = new Set(right.datasetIds);
  const shared = [...leftDatasets].filter((id) => rightDatasets.has(id));
  const onlyLeft = [...leftDatasets].filter((id) => !rightDatasets.has(id));
  const onlyRight = [...rightDatasets].filter((id) => !leftDatasets.has(id));
  const samePeriod =
    left.investigation.request.timeRange.start === right.investigation.request.timeRange.start &&
    left.investigation.request.timeRange.end === right.investigation.request.timeRange.end;
  const directlyComparable = samePeriod && shared.length > 0 && left.domain === right.domain;

  const note = directlyComparable
    ? 'Same domain, same period and at least one shared dataset: the statistical results refer to the same observations and can be read side by side.'
    : 'These investigations are not directly comparable: the domain, period or datasets differ. Differences in conclusion may come from the data selection rather than from the hypothesis.';

  return {
    leftId: left.id,
    rightId: right.id,
    sameQuestion: left.question.trim() === right.question.trim(),
    sameDomain: left.domain === right.domain,
    samePeriod,
    sharedDatasets: shared,
    onlyLeft,
    onlyRight,
    verdicts: { left: left.verdict, right: right.verdict },
    hypothesisStatements: { left: left.hypothesis, right: right.hypothesis },
    directlyComparable,
    note,
  };
}
