/**
 * Guardian storage — one contract, two adapters.
 *
 * `MemoryStore` lives in the process. It is correct for a single instance and
 * for tests, and it is **explicitly not distributed**: on Vercel every lambda
 * invocation may land on a different instance, so a memory breaker only protects
 * the instance that happened to see the failure. `capabilities.distributed` is
 * `false` and the dashboard prints "instance-local" instead of implying a fleet.
 *
 * `PostgresStore` uses the Supabase project the application already has
 * (`SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY`) through PostgREST. Atomic
 * operations are SQL functions defined in
 * `supabase/migrations/20261112000000_guardian.sql`, because a read-modify-write
 * over HTTP is not atomic and would let two instances both take a lease.
 *
 * Neither adapter ever stores a credential. Keys live in the environment; the
 * store only holds breaker state, counters, leases, samples and audit entries.
 */

import type {
  AuditEntry,
  AuditQuery,
  CounterResult,
  GuardianRunRecord,
  GuardianSample,
  GuardianStore,
  RunQuery,
  SampleQuery,
  StoreCapabilities,
  StoredValue,
} from './types';

const MEMORY_CAPS: StoreCapabilities = {
  distributed: false,
  persistent: false,
  atomicCounters: false,
  atomicCas: false,
  atomicLease: false,
};

const POSTGRES_CAPS: StoreCapabilities = {
  distributed: true,
  persistent: true,
  atomicCounters: true,
  atomicCas: true,
  atomicLease: true,
};

interface MemoryEntry {
  value: unknown;
  version: number;
  expiresAt: number | null;
}

export interface MemoryStoreOptions {
  /** Retained samples (newest kept). Bounds memory on a long-lived process. */
  maxSamples?: number;
  maxRuns?: number;
  maxAudit?: number;
}

/**
 * In-process store. Every method is synchronous internally but the contract is
 * async, so callers cannot tell the adapters apart.
 */
export class MemoryStore implements GuardianStore {
  readonly kind = 'memory' as const;
  readonly capabilities = MEMORY_CAPS;

  private readonly entries = new Map<string, MemoryEntry>();
  private readonly counters = new Map<string, { count: number; resetAt: number }>();
  private readonly leases = new Map<string, { owner: string; expiresAt: number }>();
  private readonly audit: AuditEntry[] = [];
  private readonly samples: GuardianSample[] = [];
  private readonly runs: GuardianRunRecord[] = [];
  private seq = 0;
  private readonly limits: Required<MemoryStoreOptions>;

  constructor(
    options: MemoryStoreOptions = {},
    private readonly now: () => number = Date.now,
  ) {
    this.limits = {
      maxSamples: options.maxSamples ?? 5_000,
      maxRuns: options.maxRuns ?? 200,
      maxAudit: options.maxAudit ?? 2_000,
    };
  }

  private alive(entry: MemoryEntry | undefined): entry is MemoryEntry {
    if (!entry) return false;
    if (entry.expiresAt === null) return true;
    return entry.expiresAt > this.now();
  }

  async getJson<T>(key: string): Promise<StoredValue<T> | null> {
    const entry = this.entries.get(key);
    if (!this.alive(entry)) {
      if (entry) this.entries.delete(key);
      return null;
    }
    return { value: entry.value as T, version: entry.version, expiresAt: entry.expiresAt };
  }

  async setJson<T>(key: string, value: T, options: { ttlMs?: number | null } = {}): Promise<StoredValue<T>> {
    const previous = this.entries.get(key);
    const version = (previous?.version ?? 0) + 1;
    const expiresAt = options.ttlMs === null || options.ttlMs === undefined ? null : this.now() + options.ttlMs;
    this.entries.set(key, { value, version, expiresAt });
    return { value, version, expiresAt };
  }

  /**
   * The check and the write are one synchronous step inside the event loop.
   * `await this.getJson()` followed by `await this.setJson()` would yield between
   * the comparison and the write, so two coordinators sharing this store could
   * both pass the check and both write — the exact double-acquire a CAS exists to
   * prevent (the Postgres adapter gets this from a single SQL statement).
   */
  async compareAndSetJson<T>(
    key: string,
    expectedVersion: number | null,
    value: T,
    options: { ttlMs?: number | null } = {},
  ): Promise<{ ok: boolean; stored: StoredValue<T> | null }> {
    const entry = this.entries.get(key);
    const live = entry && (entry.expiresAt === null || entry.expiresAt > this.now()) ? entry : null;
    const currentVersion = live ? live.version : null;
    if (currentVersion !== expectedVersion) {
      return {
        ok: false,
        stored: live ? { value: live.value as T, version: live.version, expiresAt: live.expiresAt } : null,
      };
    }
    const version = (live?.version ?? 0) + 1;
    const expiresAt = options.ttlMs === null || options.ttlMs === undefined ? null : this.now() + options.ttlMs;
    this.entries.set(key, { value, version, expiresAt });
    return { ok: true, stored: { value, version, expiresAt } };
  }

  async increment(key: string, windowMs: number, amount = 1): Promise<CounterResult> {
    const at = this.now();
    const existing = this.counters.get(key);
    if (!existing || existing.resetAt <= at) {
      const fresh = { count: amount, resetAt: at + windowMs };
      this.counters.set(key, fresh);
      return { count: fresh.count, resetAt: fresh.resetAt };
    }
    existing.count += amount;
    return { count: existing.count, resetAt: existing.resetAt };
  }

  async acquireLease(key: string, owner: string, ttlMs: number): Promise<boolean> {
    const at = this.now();
    const existing = this.leases.get(key);
    if (existing && existing.expiresAt > at && existing.owner !== owner) return false;
    this.leases.set(key, { owner, expiresAt: at + ttlMs });
    return true;
  }

  async renewLease(key: string, owner: string, ttlMs: number): Promise<boolean> {
    const at = this.now();
    const existing = this.leases.get(key);
    if (!existing || existing.owner !== owner || existing.expiresAt <= at) return false;
    existing.expiresAt = at + ttlMs;
    return true;
  }

  async releaseLease(key: string, owner: string): Promise<void> {
    const existing = this.leases.get(key);
    if (existing && existing.owner === owner) this.leases.delete(key);
  }

  async leaseHolder(key: string): Promise<{ owner: string; expiresAt: number } | null> {
    const existing = this.leases.get(key);
    if (!existing || existing.expiresAt <= this.now()) return null;
    return { owner: existing.owner, expiresAt: existing.expiresAt };
  }

  async appendAudit(entry: Omit<AuditEntry, 'id'>): Promise<AuditEntry> {
    this.seq += 1;
    const record: AuditEntry = { ...entry, id: `mem-${String(this.seq).padStart(6, '0')}` };
    this.audit.push(record);
    if (this.audit.length > this.limits.maxAudit) this.audit.splice(0, this.audit.length - this.limits.maxAudit);
    return record;
  }

  async listAudit(query: AuditQuery = {}): Promise<AuditEntry[]> {
    const limit = Math.max(1, Math.min(query.limit ?? 100, 1_000));
    return this.audit
      .filter((entry) => (query.since ? entry.at >= query.since : true))
      .filter((entry) => (query.severity ? entry.severity === query.severity : true))
      .filter((entry) => (query.action ? entry.action === query.action : true))
      .filter((entry) => (query.target ? entry.target === query.target : true))
      .filter((entry) => (query.actor ? entry.actor === query.actor : true))
      .slice(-limit)
      .reverse();
  }

  async appendSample(sample: GuardianSample): Promise<void> {
    this.samples.push(sample);
    if (this.samples.length > this.limits.maxSamples) {
      this.samples.splice(0, this.samples.length - this.limits.maxSamples);
    }
  }

  async listSamples(query: SampleQuery = {}): Promise<GuardianSample[]> {
    const limit = Math.max(1, Math.min(query.limit ?? 200, 5_000));
    return this.samples
      .filter((sample) => (query.since ? sample.at >= query.since : true))
      .filter((sample) => (query.providerId ? sample.providerId === query.providerId : true))
      .slice(-limit)
      .reverse();
  }

  async putRun(run: GuardianRunRecord): Promise<void> {
    const index = this.runs.findIndex((entry) => entry.id === run.id);
    if (index >= 0) this.runs[index] = run;
    else this.runs.push(run);
    if (this.runs.length > this.limits.maxRuns) this.runs.splice(0, this.runs.length - this.limits.maxRuns);
  }

  async listRuns(query: RunQuery = {}): Promise<GuardianRunRecord[]> {
    const limit = Math.max(1, Math.min(query.limit ?? 50, 500));
    return this.runs
      .filter((run) => (query.since ? run.startedAt >= query.since : true))
      .slice(-limit)
      .reverse();
  }

  async prune(now = this.now()): Promise<number> {
    let removed = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt !== null && entry.expiresAt <= now) {
        this.entries.delete(key);
        removed += 1;
      }
    }
    for (const [key, counter] of this.counters) {
      if (counter.resetAt <= now) {
        this.counters.delete(key);
        removed += 1;
      }
    }
    for (const [key, lease] of this.leases) {
      if (lease.expiresAt <= now) {
        this.leases.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    return { ok: true, detail: 'in-process store' };
  }

  describe(): Record<string, unknown> {
    return {
      kind: 'memory',
      keys: this.entries.size,
      counters: this.counters.size,
      leases: this.leases.size,
      audit: this.audit.length,
      samples: this.samples.length,
      runs: this.runs.length,
      limits: this.limits,
    };
  }
}

/* ------------------------------ Postgres adapter ----------------------------- */

export interface PostgresStoreOptions {
  url: string;
  serviceRoleKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  now?: () => number;
  /** Namespace so two deployments can share one project without colliding. */
  namespace?: string;
}

export class StoreError extends Error {
  constructor(message: string, readonly code: string, readonly status?: number) {
    super(message);
    this.name = 'StoreError';
  }
}

/**
 * Supabase/PostgREST adapter. Atomics live in SQL (see the migration) because a
 * read-modify-write across two HTTP round trips is not atomic: two instances
 * would both observe "no lease" and both take it.
 */
export class PostgresStore implements GuardianStore {
  readonly kind = 'postgres' as const;
  readonly capabilities = POSTGRES_CAPS;

  private readonly baseUrl: string;
  private readonly key: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;
  private readonly now: () => number;
  private readonly ns: string;

  constructor(options: PostgresStoreOptions) {
    this.baseUrl = options.url.replace(/\/+$/, '');
    this.key = options.serviceRoleKey;
    this.fetchImpl = options.fetchImpl ?? ((...args) => globalThis.fetch(...args));
    this.timeoutMs = options.timeoutMs ?? 5_000;
    this.now = options.now ?? Date.now;
    this.ns = options.namespace ?? 'cosmora';
  }

  private scoped(key: string): string {
    return `${this.ns}:${key}`;
  }

  private headers(): Record<string, string> {
    return {
      apikey: this.key,
      Authorization: `Bearer ${this.key}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
  }

  /**
   * One place where PostgREST is called. Failures become a typed `StoreError`
   * whose message never contains the URL query (which can carry filters built
   * from state) and never the key.
   */
  private async call<T>(path: string, init: RequestInit & { body?: string }): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    let response: Response;
    try {
      response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        ...init,
        headers: { ...this.headers(), ...(init.headers as Record<string, string> | undefined) },
        signal: controller.signal,
      });
    } catch (error) {
      clearTimeout(timer);
      const aborted = (error as { name?: string })?.name === 'AbortError';
      throw new StoreError(
        aborted ? 'Guardian store timed out.' : 'Guardian store was unreachable.',
        aborted ? 'STORE_TIMEOUT' : 'STORE_NETWORK',
      );
    }
    clearTimeout(timer);
    const text = await response.text();
    if (!response.ok) {
      throw new StoreError(`Guardian store rejected the request (${response.status}).`, 'STORE_HTTP', response.status);
    }
    if (!text) return undefined as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new StoreError('Guardian store returned a non-JSON body.', 'STORE_SHAPE');
    }
  }

  private rpc<T>(fn: string, body: Record<string, unknown>): Promise<T> {
    return this.call<T>(`/rest/v1/rpc/${fn}`, { method: 'POST', body: JSON.stringify(body) });
  }

  async getJson<T>(key: string): Promise<StoredValue<T> | null> {
    const rows = await this.rpc<Array<{ value: T; version: number; expires_at: string | null }>>('guardian_kv_get', {
      p_key: this.scoped(key),
      p_now: new Date(this.now()).toISOString(),
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    return {
      value: row.value,
      version: row.version,
      expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
    };
  }

  async setJson<T>(key: string, value: T, options: { ttlMs?: number | null } = {}): Promise<StoredValue<T>> {
    const rows = await this.rpc<Array<{ version: number; expires_at: string | null }>>('guardian_kv_set', {
      p_key: this.scoped(key),
      p_value: value,
      p_ttl_ms: options.ttlMs ?? null,
    });
    const row = rows?.[0];
    return {
      value,
      version: row?.version ?? 0,
      expiresAt: row?.expires_at ? Date.parse(row.expires_at) : null,
    };
  }

  async compareAndSetJson<T>(
    key: string,
    expectedVersion: number | null,
    value: T,
    options: { ttlMs?: number | null } = {},
  ): Promise<{ ok: boolean; stored: StoredValue<T> | null }> {
    const result = await this.rpc<Array<{ ok: boolean; version: number | null; expires_at: string | null }>>(
      'guardian_kv_cas',
      {
        p_key: this.scoped(key),
        p_expected_version: expectedVersion,
        p_value: value,
        p_ttl_ms: options.ttlMs ?? null,
      },
    );
    const row = Array.isArray(result) ? result[0] : null;
    if (!row || !row.ok) return { ok: false, stored: null };
    return {
      ok: true,
      stored: {
        value,
        version: row.version ?? 0,
        expiresAt: row.expires_at ? Date.parse(row.expires_at) : null,
      },
    };
  }

  async increment(key: string, windowMs: number, amount = 1): Promise<CounterResult> {
    const rows = await this.rpc<Array<{ count: number; reset_at: string }>>('guardian_counter', {
      p_key: this.scoped(key),
      p_window_ms: Math.max(1, Math.floor(windowMs)),
      p_amount: amount,
    });
    const row = rows?.[0];
    if (!row) throw new StoreError('Guardian counter returned no row.', 'STORE_SHAPE');
    return { count: row.count, resetAt: Date.parse(row.reset_at) };
  }

  private leaseCall(mode: 'acquire' | 'renew' | 'release', key: string, owner: string, ttlMs: number) {
    return this.rpc<boolean>('guardian_lease', {
      p_key: this.scoped(key),
      p_owner: owner,
      p_ttl_ms: mode === 'release' ? 0 : Math.max(1, Math.floor(ttlMs)),
      p_mode: mode,
    });
  }

  async acquireLease(key: string, owner: string, ttlMs: number): Promise<boolean> {
    return Boolean(await this.leaseCall('acquire', key, owner, ttlMs));
  }

  async renewLease(key: string, owner: string, ttlMs: number): Promise<boolean> {
    return Boolean(await this.leaseCall('renew', key, owner, ttlMs));
  }

  async releaseLease(key: string, owner: string): Promise<void> {
    await this.leaseCall('release', key, owner, 0);
  }

  async leaseHolder(key: string): Promise<{ owner: string; expiresAt: number } | null> {
    const rows = await this.call<Array<{ owner: string; expires_at: string }>>(
      `/rest/v1/guardian_leases?key=eq.${encodeURIComponent(this.scoped(key))}&select=owner,expires_at`,
      { method: 'GET' },
    );
    const row = Array.isArray(rows) ? rows[0] : null;
    if (!row) return null;
    const expiresAt = Date.parse(row.expires_at);
    if (!Number.isFinite(expiresAt) || expiresAt <= this.now()) return null;
    return { owner: row.owner, expiresAt };
  }

  async appendAudit(entry: Omit<AuditEntry, 'id'>): Promise<AuditEntry> {
    const rows = await this.call<Array<{ id: number; at: string }>>('/rest/v1/guardian_audit', {
      method: 'POST',
      body: JSON.stringify({
        at: new Date(entry.at).toISOString(),
        actor: entry.actor,
        action: entry.action,
        target: entry.target,
        severity: entry.severity,
        detail: entry.detail ?? null,
      }),
      headers: { Prefer: 'return=representation' },
    });
    const row = Array.isArray(rows) ? rows[0] : null;
    return { ...entry, id: row ? `pg-${row.id}` : 'pg-unknown' };
  }

  async listAudit(query: AuditQuery = {}): Promise<AuditEntry[]> {
    const limit = Math.max(1, Math.min(query.limit ?? 100, 1_000));
    const filters = ['select=id,at,actor,action,target,severity,detail', 'order=at.desc', `limit=${limit}`];
    if (query.since) filters.push(`at=gte.${new Date(query.since).toISOString()}`);
    if (query.severity) filters.push(`severity=eq.${query.severity}`);
    if (query.action) filters.push(`action=eq.${encodeURIComponent(query.action)}`);
    if (query.target) filters.push(`target=eq.${encodeURIComponent(query.target)}`);
    if (query.actor) filters.push(`actor=eq.${encodeURIComponent(query.actor)}`);
    const rows = await this.call<Array<{
      id: number;
      at: string;
      actor: string;
      action: string;
      target: string;
      severity: string;
      detail: Record<string, unknown> | null;
    }>>(`/rest/v1/guardian_audit?${filters.join('&')}`, { method: 'GET' });
    return (rows || []).map((row) => ({
      id: `pg-${row.id}`,
      at: Date.parse(row.at),
      actor: row.actor,
      action: row.action,
      target: row.target,
      severity: row.severity as AuditEntry['severity'],
      detail: row.detail ?? undefined,
    }));
  }

  async appendSample(sample: GuardianSample): Promise<void> {
    await this.call('/rest/v1/guardian_samples', {
      method: 'POST',
      body: JSON.stringify({
        at: new Date(sample.at).toISOString(),
        provider_id: sample.providerId,
        status: sample.status,
        code: sample.code,
        latency_ms: sample.latencyMs,
        http_status: sample.httpStatus ?? null,
        reason: sample.reason ?? null,
        run_id: sample.runId ?? null,
      }),
      headers: { Prefer: 'return=minimal' },
    });
  }

  async listSamples(query: SampleQuery = {}): Promise<GuardianSample[]> {
    const limit = Math.max(1, Math.min(query.limit ?? 200, 5_000));
    const filters = ['select=at,provider_id,status,code,latency_ms,http_status,reason,run_id', 'order=at.desc', `limit=${limit}`];
    if (query.since) filters.push(`at=gte.${new Date(query.since).toISOString()}`);
    if (query.providerId) filters.push(`provider_id=eq.${encodeURIComponent(query.providerId)}`);
    const rows = await this.call<Array<{
      at: string;
      provider_id: string;
      status: string;
      code: string;
      latency_ms: number | null;
      http_status: number | null;
      reason: string | null;
      run_id: string | null;
    }>>(`/rest/v1/guardian_samples?${filters.join('&')}`, { method: 'GET' });
    return (rows || []).map((row) => ({
      at: Date.parse(row.at),
      providerId: row.provider_id,
      status: row.status as GuardianSample['status'],
      code: row.code,
      latencyMs: row.latency_ms,
      httpStatus: row.http_status,
      reason: row.reason,
      runId: row.run_id,
    }));
  }

  async putRun(run: GuardianRunRecord): Promise<void> {
    await this.call('/rest/v1/guardian_runs', {
      method: 'POST',
      body: JSON.stringify({
        id: run.id,
        started_at: new Date(run.startedAt).toISOString(),
        finished_at: run.finishedAt ? new Date(run.finishedAt).toISOString() : null,
        trigger: run.trigger,
        instance_id: run.instanceId,
        summary: run.summary,
        error: run.error ?? null,
      }),
      headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    });
  }

  async listRuns(query: RunQuery = {}): Promise<GuardianRunRecord[]> {
    const limit = Math.max(1, Math.min(query.limit ?? 50, 500));
    const filters = ['select=id,started_at,finished_at,trigger,instance_id,summary,error', 'order=started_at.desc', `limit=${limit}`];
    if (query.since) filters.push(`started_at=gte.${new Date(query.since).toISOString()}`);
    const rows = await this.call<Array<{
      id: string;
      started_at: string;
      finished_at: string | null;
      trigger: string;
      instance_id: string;
      summary: GuardianRunRecord['summary'];
      error: string | null;
    }>>(`/rest/v1/guardian_runs?${filters.join('&')}`, { method: 'GET' });
    return (rows || []).map((row) => ({
      id: row.id,
      startedAt: Date.parse(row.started_at),
      finishedAt: row.finished_at ? Date.parse(row.finished_at) : null,
      trigger: row.trigger as GuardianRunRecord['trigger'],
      instanceId: row.instance_id,
      summary: row.summary,
      error: row.error,
    }));
  }

  async prune(now = this.now()): Promise<number> {
    const result = await this.rpc<number>('guardian_prune', { p_now: new Date(now).toISOString() });
    return Number(result) || 0;
  }

  async health(): Promise<{ ok: boolean; detail?: string }> {
    try {
      await this.rpc('guardian_health', {});
      return { ok: true, detail: 'supabase postgrest' };
    } catch (error) {
      const storeError = error as StoreError;
      return { ok: false, detail: `${storeError.code ?? 'STORE_ERROR'}: ${storeError.message}` };
    }
  }

  describe(): Record<string, unknown> {
    return {
      kind: 'postgres',
      // Host only: never the full URL with query, never the key.
      host: (() => {
        try {
          return new URL(this.baseUrl).host;
        } catch {
          return 'invalid-url';
        }
      })(),
      namespace: this.ns,
      timeoutMs: this.timeoutMs,
    };
  }
}

/* --------------------------------- factory ---------------------------------- */

export interface StoreSelection {
  store: GuardianStore;
  /** Why this adapter was chosen, printed in the dashboard. */
  reason: string;
  /** Env var *names* that are missing; never values. */
  missing: string[];
}

export function isServiceRoleKey(key: string): boolean {
  const value = (key || '').trim();
  if (!value) return false;
  if (value.startsWith('sb_secret_')) return true;
  // Legacy service-role JWT: the payload must claim the postgres/service_role role.
  const parts = value.split('.');
  if (parts.length !== 3) return false;
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return payload?.role === 'service_role';
  } catch {
    return false;
  }
}

/**
 * Chooses the store from the environment.
 *
 * A service-role key is required on purpose: the guardian tables are closed to
 * anon/authenticated roles via RLS, so the anon key cannot read fleet state. If
 * the deployment has no service role key, the Guardian still runs — it simply
 * says, in the API and in the dashboard, that its guarantees are instance-local.
 */
export function createGuardianStore(
  env: Record<string, string | undefined> = process.env,
  overrides: { fetchImpl?: typeof fetch; now?: () => number; namespace?: string } = {},
): StoreSelection {
  const url = (env.GUARDIAN_STORE_URL || env.SUPABASE_URL || '').trim();
  const key = (env.GUARDIAN_STORE_KEY || env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  const namespace = overrides.namespace || (env.GUARDIAN_NAMESPACE || 'cosmora').trim() || 'cosmora';

  const memory = (reason: string, missing: string[] = []): StoreSelection => ({
    store: new MemoryStore({}, overrides.now),
    reason,
    missing,
  });

  if (!url) return memory('GUARDIAN_STORE_URL / SUPABASE_URL is not set — instance-local state only.', ['SUPABASE_URL']);
  if (!key) {
    return memory('No service-role key is configured — instance-local state only.', ['SUPABASE_SERVICE_ROLE_KEY']);
  }
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return memory('The configured store URL is not a valid URL — instance-local state only.');
  }
  if (parsed.protocol !== 'https:') {
    return memory('The configured store URL is not https — instance-local state only.');
  }
  if (!isServiceRoleKey(key)) {
    return memory('The configured store key is not a service-role key — instance-local state only.');
  }

  return {
    store: new PostgresStore({
      url: parsed.toString(),
      serviceRoleKey: key,
      fetchImpl: overrides.fetchImpl,
      now: overrides.now,
      namespace,
    }),
    reason: 'Supabase Postgres store with SQL-atomic primitives — state is shared across instances.',
    missing: [],
  };
}
