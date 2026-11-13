/**
 * COSMORA API Guardian — shared contracts.
 *
 * The Guardian watches every external dependency the application has (NASA data
 * services, the AI providers, the Earth/POWER and GIBS layers), records what it
 * saw, opens circuits on repeat failure, limits fleet-wide request rates,
 * performs bounded recovery actions and keeps an append-only audit of who asked
 * for what.
 *
 * Everything here is transport-agnostic on purpose: the modules receive a
 * `GuardianStore` and a `now()` clock, so the same code can run against the
 * process-local memory store (single instance, or tests) and against the
 * Postgres-backed store (several serverless instances sharing one state).
 *
 * Design invariant: **a guarantee is only claimed when the store can actually
 * provide it.** `GuardianStore.distributed` is reported to the dashboard, and
 * the dashboard says "instance-local" rather than pretending a fleet-wide
 * breaker exists when the deployment runs on memory.
 */

export type GuardianSeverity = 'info' | 'warning' | 'critical';

export type GuardianProviderKind = 'nasa' | 'ai' | 'earth' | 'science' | 'internal';

/** Delivery guarantees a store can make. Reported verbatim in the dashboard. */
export interface StoreCapabilities {
  /** True only when state is shared between serverless instances. */
  distributed: boolean;
  /** True when writes survive a process restart / cold start. */
  persistent: boolean;
  /** True when `increment` is atomic across instances. */
  atomicCounters: boolean;
  /** True when `compareAndSet` is atomic across instances. */
  atomicCas: boolean;
  /** True when a lease cannot be held by two instances at once. */
  atomicLease: boolean;
}

export interface StoredValue<T> {
  value: T;
  version: number;
  /** Epoch ms, or null for "does not expire". */
  expiresAt: number | null;
}

export interface CounterResult {
  count: number;
  /** Epoch ms at which the fixed window resets. */
  resetAt: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  actor: string;
  action: string;
  target: string;
  severity: GuardianSeverity;
  /** Never contains a credential: callers redact before appending. */
  detail?: Record<string, unknown>;
}

export interface AuditQuery {
  limit?: number;
  since?: number;
  severity?: GuardianSeverity;
  action?: string;
  target?: string;
  /** Operator/instance that performed the action. */
  actor?: string;
}

export interface GuardianSample {
  at: number;
  providerId: string;
  status: GuardianProbeStatus;
  code: string;
  latencyMs: number | null;
  httpStatus?: number | null;
  /** Redacted, single-line, no credential. */
  reason?: string | null;
  runId?: string | null;
}

export interface SampleQuery {
  limit?: number;
  since?: number;
  providerId?: string;
}

export interface GuardianRunRecord {
  id: string;
  startedAt: number;
  finishedAt: number | null;
  trigger: GuardianRunTrigger;
  /** Who/which instance executed it. */
  instanceId: string;
  summary: RunSummary | null;
  error?: string | null;
}

export interface RunQuery {
  limit?: number;
  since?: number;
}

export type GuardianRunTrigger = 'manual' | 'schedule' | 'recovery-verify' | 'startup';

export type GuardianProbeStatus = 'ok' | 'degraded' | 'down' | 'unconfigured' | 'skipped';

export interface ProbeOutcome {
  providerId: string;
  status: GuardianProbeStatus;
  code: string;
  latencyMs: number | null;
  httpStatus?: number | null;
  reason?: string | null;
  /** Extra facts for root-cause analysis; never a credential. */
  evidence?: Record<string, unknown>;
  checkedAt: number;
}

export interface ProviderDefinition {
  id: string;
  label: string;
  kind: GuardianProviderKind;
  /** Host or in-process endpoint, for display only. */
  endpoint: string;
  docsUrl?: string;
  /** Env var names (names only) that switch the provider on. */
  requiresEnv: string[];
  /** Probe cost class, used to keep scheduled runs cheap. */
  cost: 'free' | 'metered';
  run: (context: ProbeContext) => Promise<ProbeOutcome>;
}

export interface ProbeContext {
  fetchImpl: typeof fetch;
  env: Record<string, string | undefined>;
  now: () => number;
  timeoutMs: number;
  /** Probes must respect this signal in addition to their own timeout. */
  signal: AbortSignal;
}

export interface RunSummary {
  runId: string;
  startedAt: number;
  finishedAt: number;
  durationMs: number;
  trigger: GuardianRunTrigger;
  instanceId: string;
  triggeredBy: string;
  total: number;
  ok: number;
  degraded: number;
  down: number;
  skipped: number;
  unconfigured: number;
  /** True when at least one provider that should work is down. */
  incident: boolean;
  outcomes: ProbeOutcome[];
}

/** The whole store contract. Both adapters implement this exactly. */
export interface GuardianStore {
  readonly kind: 'memory' | 'postgres';
  readonly capabilities: StoreCapabilities;

  getJson<T>(key: string): Promise<StoredValue<T> | null>;
  setJson<T>(key: string, value: T, options?: { ttlMs?: number | null }): Promise<StoredValue<T>>;
  /** `expectedVersion === null` means "create only if absent". */
  compareAndSetJson<T>(
    key: string,
    expectedVersion: number | null,
    value: T,
    options?: { ttlMs?: number | null },
  ): Promise<{ ok: boolean; stored: StoredValue<T> | null }>;

  increment(key: string, windowMs: number, amount?: number): Promise<CounterResult>;

  acquireLease(key: string, owner: string, ttlMs: number): Promise<boolean>;
  renewLease(key: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseLease(key: string, owner: string): Promise<void>;
  leaseHolder(key: string): Promise<{ owner: string; expiresAt: number } | null>;

  appendAudit(entry: Omit<AuditEntry, 'id'>): Promise<AuditEntry>;
  listAudit(query?: AuditQuery): Promise<AuditEntry[]>;

  appendSample(sample: GuardianSample): Promise<void>;
  listSamples(query?: SampleQuery): Promise<GuardianSample[]>;

  putRun(run: GuardianRunRecord): Promise<void>;
  listRuns(query?: RunQuery): Promise<GuardianRunRecord[]>;

  /** Housekeeping: drop expired keys and enforce retention. Returns removed keys. */
  prune(now?: number): Promise<number>;
  health(): Promise<{ ok: boolean; detail?: string }>;
  /** Test/debug helper; both adapters expose their configuration without secrets. */
  describe(): Record<string, unknown>;
}
