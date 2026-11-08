/**
 * Client for the NOVA L.I.F.E. engine (`/api/nova/life`).
 *
 * The surface renders whatever this returns and nothing else: no placeholder
 * metrics, no optimistic values. Every failure keeps its engine code so the UI
 * can explain *why* (permission, approval, local-only) instead of showing a
 * generic error.
 */

const BASE = '/api/nova/life';

export class LifeApiError extends Error {
  code: string;
  status: number;
  details: unknown;

  constructor(message: string, code: string, status: number, details: unknown = null) {
    super(message);
    this.name = 'LifeApiError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers || {}) },
    credentials: 'same-origin',
  });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new LifeApiError(
      body?.error || `The engine answered ${response.status}.`,
      body?.code || 'LIFE_HTTP_ERROR',
      response.status,
      body?.details ?? body?.capability ?? null,
    );
  }
  return body as T;
}

const get = <T>(path: string) => request<T>(path);
const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const patch = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });
const del = <T>(path: string) => request<T>(path, { method: 'DELETE' });

export interface LifeMemory {
  id: string;
  category: 'working' | 'episodic' | 'semantic' | 'procedural' | 'personal';
  title: string;
  body: string;
  language: string;
  tags: string[];
  version: number;
  createdAt: string;
  updatedAt: string;
  expiresAt: string | null;
}

export interface LifeStatus {
  name: string;
  architecture: string;
  schemaVersion: number;
  storage: { engine: string; fts: boolean; path: string };
  mode: { localOnly: boolean; executionEnabled: boolean };
  hardware: { id: string; label: string; contextTokens: number; maxConcurrentModels: number; notes: string[] };
  providers: { total: number; localConfigured: number; cloudConfigured: number };
  counts: Record<string, number | Record<string, number>>;
  permissions: Array<{ id: string; level: string; granted: boolean; requiresApproval: boolean }>;
  graph: { edges: number; byRelation: Record<string, number> };
  tools: Array<{ id: string; level: string; description: string; granted: boolean; enabled: boolean; requiresApproval: boolean }>;
}

export interface ProviderStatus {
  id: string;
  label: string;
  kind: 'local' | 'cloud';
  status: string;
  ok: boolean;
  latencyMs: number | null;
  models: string[];
  detail: string | null;
}

export interface LifeSkill {
  id: string;
  name: string;
  description: string;
  status: string;
  currentVersion: number;
  permissions: string[];
  versionCount?: number;
  versions?: Array<{
    version: number;
    verification: { passed?: boolean; testedAt?: string; executed?: boolean } | null;
    approvedAt: string | null;
  }>;
}

export interface LifeTask {
  id: string;
  objective: string;
  language: string;
  status: string;
  plan: { intents?: string[] };
  allowedTools: string[];
  result: { summary?: string; verification?: string } | null;
  createdAt: string;
  steps?: Array<{ id: string; seq: number; title: string; status: string; error: string | null }>;
}

export interface LifeExperience {
  id: string;
  taskType: string;
  objective: string;
  executionSummary: string;
  outcome: 'success' | 'partial' | 'failure';
  verified: boolean;
  replayable: boolean;
  evidenceIds: string[];
  recordedAt?: string;
  createdAt: string;
}

export interface LifeVerification {
  id: string;
  taskId: string;
  status: 'verified' | 'partially_verified' | 'unverified' | 'failed';
  checks: Array<{ name: string; passed: boolean; detail: string | null }>;
  evidenceIds: string[];
  errors: string[];
  verifiedAt: string;
}

export interface LifeAuditEvent {
  id: string;
  kind: string;
  severity: 'info' | 'warning' | 'critical';
  subject: string | null;
  detail: Record<string, unknown>;
  created_at: string;
}

export interface LifeBenchmarkRun {
  runId: string;
  measuredAt: string;
  total: number;
  passed: number;
  byLanguage: Record<string, { total: number; passed: number; latencyMs: number }>;
  results: Array<{ caseId: string; name: string; language: string; passed: boolean; latencyMs: number; detail: string }>;
}

export const lifeApi = {
  status: () => get<LifeStatus>('/status'),
  config: () => get<{ localOnly: boolean; executionEnabled: boolean; providers: Array<Record<string, unknown>>; hardware: unknown }>('/config'),
  health: () => post<{ localOnly: boolean; localAvailable: boolean; providers: ProviderStatus[]; checkedAt: string }>('/providers/health'),

  memory: (category?: string) => get<{ counts: { total: number; byCategory: Record<string, number> }; memories: LifeMemory[]; categories: string[]; retention: Record<string, number | null> }>(
    `/memory${category ? `?category=${encodeURIComponent(category)}` : ''}`,
  ),
  addMemory: (input: { title: string; body: string; category: string }) => post<{ memory: LifeMemory; duplicate: boolean }>('/memory', input),
  deleteMemory: (id: string) => del<{ deleted: boolean }>(`/memory/${id}`),
  searchMemory: (query: string) =>
    get<{ query: string; strategy: string; results: Array<{ memory: LifeMemory; score: number; parts: Record<string, number | null> }> }>(
      `/memory/search?q=${encodeURIComponent(query)}`,
    ),

  tasks: () => get<{ tasks: LifeTask[] }>('/tasks'),
  createTask: (objective: string, allowedTools?: string[]) => post<LifeTask>('/tasks', { objective, allowedTools }),
  runTask: (id: string) => post<{ task: LifeTask; verification: LifeVerification | null; paused: boolean; capability?: string }>(`/tasks/${id}/run`, {}),
  task: (id: string) => get<LifeTask>(`/tasks/${id}`),

  skills: () => get<{ skills: LifeSkill[]; states: string[] }>('/skills'),
  skill: (id: string) => get<{ skill: LifeSkill; runs: Array<{ status: string; details: { checks?: unknown[] } }> }>(`/skills/${id}`),
  skillAction: (id: string, action: string, body: unknown = {}) =>
    post<{ skill: LifeSkill; passed?: boolean; checks?: Array<{ name: string; passed: boolean; detail: string }> }>(`/skills/${id}/${action}`, body),

  experiences: () => get<{ experiences: LifeExperience[] }>('/experiences'),
  replay: (id: string) => post<{ steps: Array<{ title: string; detail: string }> }>(`/experiences/${id}/replay`),

  verifications: () => get<{ verifications: LifeVerification[] }>('/verifications'),
  evidence: (taskId: string) => get<{ evidence: Array<{ id: string; label: string; kind: string; digest: string }> }>(`/evidence?taskId=${encodeURIComponent(taskId)}`),

  security: () =>
    get<{
      permissions: Array<{ id: string; level: string; granted: boolean; requiresApproval: boolean; label: string }>;
      audit: LifeAuditEvent[];
      executionEnabled: boolean;
      tools: Array<{ id: string; level: string; granted: boolean; enabled: boolean }>;
    }>('/security'),
  setGrant: (capability: string, granted: boolean) => post<Array<{ id: string; granted: boolean }>>('/security/grants', { capability, granted }),
  approve: (subjectType: string, subjectId: string, decision: 'approved' | 'rejected', note?: string) =>
    post<{ id: string; decision: string }>('/security/approvals', { subjectType, subjectId, decision, note }),

  benchmarks: () =>
    get<{ dataset: Array<{ id: string; suite: string; name: string; language: string }>; history: Array<{ runId: string; total: number; passed: number; measuredAt: string }> }>(
      '/benchmarks',
    ),
  runBenchmarks: () => post<LifeBenchmarkRun>('/benchmarks/run', {}),
};
