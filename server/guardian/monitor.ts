/**
 * The sweep: probe every dependency, once, under one lease.
 *
 * Shape of a run:
 *
 *   lease ──▶ for each provider:  circuit? ──▶ budget? ──▶ probe ──▶ record
 *     │                              │            │
 *     │                              └ skipped    └ skipped (never "ok")
 *     └ overlapping runs return { ran: false, holder } instead of doubling the spend
 *
 * Everything a run learns is written to the store: one sample per provider (for
 * analytics), one breaker record (for the fast path), one run record (for
 * history) and audit entries only for things a human would want to know about.
 *
 * The sweep is deliberately forgetful between runs: no module-level last-status
 * cache, because two instances would then disagree about what "changed".
 */

import { createBreaker, type BreakerState } from './breaker';
import { withLease, newInstanceId } from './lease';
import { createFleetRateLimiter, DEFAULT_QUOTAS, type FleetRateLimiter } from './rateLimit';
import { PROVIDERS, PROVIDER_INDEX, METERED_PROVIDER_IDS } from './providers';
import type {
  GuardianProbeStatus,
  GuardianRunRecord,
  GuardianRunTrigger,
  GuardianSample,
  GuardianStore,
  ProbeContext,
  ProbeOutcome,
  ProviderDefinition,
  RunSummary,
} from './types';

export interface MonitorOptions {
  store: GuardianStore;
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  instanceId?: string;
  /** Per-probe timeout. */
  timeoutMs?: number;
  /** Probes in flight at once. */
  concurrency?: number;
  /** Whole-run deadline; remaining providers are marked skipped. */
  runDeadlineMs?: number;
  leaseTtlMs?: number;
  limiter?: FleetRateLimiter;
  providers?: ProviderDefinition[];
}

export interface RunOptions {
  trigger?: GuardianRunTrigger;
  /** Who asked: an operator identity, `cron`, or `system`. */
  actor?: string;
  /** Include quota-spending providers (APOD/NeoWs/EPIC and the AI providers). */
  includeMetered?: boolean;
  /** Restrict the sweep to these ids. */
  only?: string[];
}

export interface RunResult {
  ran: boolean;
  holder?: string | null;
  summary?: RunSummary;
  reason?: string;
}

export interface ProviderAnalytics {
  providerId: string;
  label: string;
  samples: number;
  ok: number;
  degraded: number;
  down: number;
  /** ok / samples, 0..1 — null when there is no sample in the window. */
  availability: number | null;
  p50LatencyMs: number | null;
  p95LatencyMs: number | null;
  lastStatus: GuardianProbeStatus | null;
  lastSeenAt: number | null;
  codes: Record<string, number>;
}

export interface GuardianAnalytics {
  windowMs: number;
  from: number;
  to: number;
  samples: number;
  runs: number;
  incidents: number;
  providers: ProviderAnalytics[];
}

const percentile = (values: number[], p: number): number | null => {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return Math.round(sorted[index]);
};

export function createGuardianMonitor(options: MonitorOptions) {
  const store = options.store;
  const env = options.env ?? (typeof process !== 'undefined' ? process.env : {});
  const fetchImpl = options.fetchImpl ?? ((...args: Parameters<typeof fetch>) => globalThis.fetch(...args));
  const now = options.now ?? Date.now;
  const random = options.random ?? Math.random;
  const instanceId = options.instanceId ?? newInstanceId();
  const timeoutMs = options.timeoutMs ?? 8_000;
  const concurrency = Math.max(1, options.concurrency ?? 4);
  const runDeadlineMs = options.runDeadlineMs ?? 25_000;
  const leaseTtlMs = options.leaseTtlMs ?? 60_000;
  const providers = options.providers ?? PROVIDERS;
  // Run ids must be unique even when the clock does not advance (tests, or two
  // sweeps in the same millisecond): the run record is an upsert, so a collision
  // would silently overwrite history.
  let runCounter = 0;
  const index = Object.fromEntries(providers.map((provider) => [provider.id, provider]));

  const breaker = createBreaker(store, { now, random });
  const limiter =
    options.limiter ??
    createFleetRateLimiter(store, {
      now,
      quotas: env.GUARDIAN_PROBE_LIMIT
        ? { 'guardian:probe': { ...DEFAULT_QUOTAS['guardian:probe'], limit: Number(env.GUARDIAN_PROBE_LIMIT) || 30 } }
        : undefined,
    });

  async function probeOne(provider: ProviderDefinition, deadline: number, signal: AbortSignal): Promise<ProbeOutcome> {
    const context: ProbeContext = {
      fetchImpl,
      env,
      now,
      timeoutMs: Math.max(500, Math.min(timeoutMs, deadline - now())),
      signal,
    };
    try {
      const outcome = await provider.run(context);
      // Guard against a probe that returns something structurally wrong.
      if (!outcome || typeof outcome !== 'object' || !outcome.code) {
        return {
          providerId: provider.id,
          status: 'down',
          code: 'PROBE_BUG',
          latencyMs: null,
          reason: 'The probe returned no usable outcome.',
          checkedAt: now(),
        };
      }
      return { ...outcome, providerId: provider.id };
    } catch {
      return {
        providerId: provider.id,
        status: 'down',
        code: 'PROBE_THREW',
        latencyMs: null,
        reason: 'The probe threw instead of returning an outcome.',
        checkedAt: now(),
      };
    }
  }

  async function runOnce(runOptions: RunOptions = {}): Promise<RunResult> {
    const trigger = runOptions.trigger ?? 'manual';
    const actor = runOptions.actor ?? 'system';
    const includeMetered = Boolean(runOptions.includeMetered);
    const selected = (runOptions.only?.length ? runOptions.only : providers.map((p) => p.id))
      .map((id) => index[id] ?? PROVIDER_INDEX[id])
      .filter((provider): provider is ProviderDefinition => Boolean(provider));

    const lease = await withLease(
      store,
      { key: 'lease:sweep', owner: instanceId, ttlMs: leaseTtlMs },
      async () => {
        const startedAt = now();
        runCounter += 1;
        const runId = `run-${startedAt.toString(36)}-${instanceId.slice(-6)}-${runCounter}`;
        const record: GuardianRunRecord = {
          id: runId,
          startedAt,
          finishedAt: null,
          trigger,
          instanceId,
          summary: null,
        };
        await store.putRun(record).catch(() => {});

        // Housekeeping is cheap and idempotent; doing it at the start means a
        // crashed sweep still leaves the store tidy.
        await store.prune(startedAt).catch(() => {});

        const deadline = startedAt + runDeadlineMs;
        const controller = new AbortController();
        const outcomes: ProbeOutcome[] = new Array(selected.length);

        const workers = Math.min(concurrency, selected.length);
        let cursor = 0;
        let previous: Record<string, BreakerState | null> = {};
        try {
          previous = await breaker.snapshotAll(selected.map((p) => p.id));
        } catch {
          previous = {};
        }

        const skip = (provider: ProviderDefinition, code: string, reason: string, evidence?: Record<string, unknown>) => {
          const outcome: ProbeOutcome = {
            providerId: provider.id,
            status: 'skipped',
            code,
            latencyMs: null,
            reason,
            evidence,
            checkedAt: now(),
          };
          return outcome;
        };

        const work = async () => {
          for (;;) {
            const position = cursor;
            cursor += 1;
            if (position >= selected.length) return;
            const provider = selected[position];

            if (now() > deadline) {
              outcomes[position] = skip(provider, 'RUN_DEADLINE', 'The sweep ran out of time before this probe.');
              continue;
            }
            if (provider.cost === 'metered' && !includeMetered) {
              outcomes[position] = skip(
                provider,
                'METERED_SKIPPED',
                'Metered provider: not probed by a cheap sweep. Run a deep sweep to check it.',
              );
              continue;
            }

            const decision = await breaker.allow(provider.id);
            if (!decision.allowed) {
              outcomes[position] = skip(provider, 'CIRCUIT_OPEN', 'The circuit is open; the probe was not attempted.', {
                retryAt: decision.retryAt ?? null,
              });
              continue;
            }

            const budget = await limiter.check('guardian:probe');
            if (!budget.allowed) {
              outcomes[position] = skip(provider, 'PROBE_BUDGET', 'The fleet probe budget for this minute is spent.', {
                resetAt: budget.resetAt,
              });
              continue;
            }

            const outcome = await probeOne(provider, deadline, controller.signal);
            outcomes[position] = outcome;
            await breaker.record(provider.id, outcome).catch(() => {});
          }
        };

        await Promise.all(Array.from({ length: workers }, work));

        const finishedAt = now();
        const count = (status: GuardianProbeStatus) => outcomes.filter((outcome) => outcome?.status === status).length;
        const summary: RunSummary = {
          runId,
          startedAt,
          finishedAt,
          durationMs: finishedAt - startedAt,
          trigger,
          instanceId,
          triggeredBy: actor,
          total: outcomes.length,
          ok: count('ok'),
          degraded: count('degraded'),
          down: count('down'),
          skipped: count('skipped'),
          unconfigured: count('unconfigured'),
          incident: count('down') > 0,
          outcomes: outcomes.filter(Boolean),
        };

        // Persist before auditing: if the audit write fails, the run is still real.
        await store.putRun({ ...record, finishedAt, summary }).catch(() => {});
        for (const outcome of summary.outcomes) {
          const sample: GuardianSample = {
            at: outcome.checkedAt,
            providerId: outcome.providerId,
            status: outcome.status,
            code: outcome.code,
            latencyMs: outcome.latencyMs,
            httpStatus: outcome.httpStatus ?? null,
            reason: outcome.reason ?? null,
            runId,
          };
          await store.appendSample(sample).catch(() => {});
        }

        try {
          if (summary.incident) {
            const downIds = summary.outcomes.filter((o) => o.status === 'down').map((o) => o.providerId);
            await store.appendAudit({
              at: finishedAt,
              actor,
              action: 'sweep-incident',
              target: downIds.join(',') || 'unknown',
              severity: 'critical',
              detail: { runId, trigger, down: downIds, degraded: summary.degraded, instanceId },
            });
          }
          // Report recovery: a provider that was open and is now answering.
          for (const outcome of summary.outcomes) {
            const before = previous[outcome.providerId];
            if (before && before.state !== 'closed' && outcome.status === 'ok') {
              await store.appendAudit({
                at: finishedAt,
                actor,
                action: 'provider-recovered',
                target: outcome.providerId,
                severity: 'info',
                detail: { runId, previousState: before.state, instanceId },
              });
            }
          }
        } catch {
          // Auditing is best effort; the run itself already succeeded or failed.
        }

        return summary;
      },
    );

    if (!lease.acquired) {
      return {
        ran: false,
        holder: lease.holder ?? null,
        reason: 'Another instance is already running a sweep; this request did not double the spend.',
      };
    }
    return { ran: true, summary: lease.value };
  }

  /** One provider, right now, breaker bypassed — used to verify a recovery. */
  async function verifyProvider(
    providerId: string,
    verifyOptions: { actor?: string } = {},
  ): Promise<{ outcome: ProbeOutcome; verified: boolean } | { error: string }> {
    const provider = index[providerId] ?? PROVIDER_INDEX[providerId];
    if (!provider) return { error: 'unknown-provider' };
    const budget = await limiter.check('guardian:probe');
    if (!budget.allowed) return { error: 'probe-budget-exhausted' };
    const controller = new AbortController();
    const outcome = await probeOne(provider, now() + timeoutMs, controller.signal);
    if (outcome.status === 'down') {
      // A verification that fails must leave the circuit open, not "closed with
      // one failure": the operator asked for proof, and there is none.
      await breaker.trip(provider.id, outcome.code).catch(() => {});
    } else {
      await breaker.record(provider.id, outcome).catch(() => {});
    }
    await store
      .appendSample({
        at: outcome.checkedAt,
        providerId: provider.id,
        status: outcome.status,
        code: outcome.code,
        latencyMs: outcome.latencyMs,
        httpStatus: outcome.httpStatus ?? null,
        reason: outcome.reason ?? null,
        runId: null,
      })
      .catch(() => {});
    await store
      .appendAudit({
        at: now(),
        actor: verifyOptions.actor ?? 'system',
        action: 'recovery-verify',
        target: provider.id,
        severity: outcome.status === 'ok' ? 'info' : 'warning',
        detail: { status: outcome.status, code: outcome.code, instanceId },
      })
      .catch(() => {});
    return { outcome, verified: outcome.status === 'ok' };
  }

  async function analytics(window: { windowMs?: number } = {}): Promise<GuardianAnalytics> {
    const windowMs = Math.max(60_000, window.windowMs ?? 24 * 60 * 60 * 1000);
    const to = now();
    const from = to - windowMs;
    const [samples, runs] = await Promise.all([
      store.listSamples({ since: from, limit: 5_000 }).catch(() => []),
      store.listRuns({ since: from, limit: 200 }).catch(() => []),
    ]);

    const byProvider = new Map<string, GuardianSample[]>();
    for (const sample of samples) {
      const list = byProvider.get(sample.providerId) ?? [];
      list.push(sample);
      byProvider.set(sample.providerId, list);
    }

    const reports: ProviderAnalytics[] = providers.map((provider) => {
      const list = byProvider.get(provider.id) ?? [];
      const ok = list.filter((s) => s.status === 'ok').length;
      const degraded = list.filter((s) => s.status === 'degraded').length;
      const down = list.filter((s) => s.status === 'down').length;
      const answered = ok + degraded + down;
      const latencies = list.map((s) => s.latencyMs).filter((value): value is number => typeof value === 'number');
      const codes: Record<string, number> = {};
      for (const sample of list) codes[sample.code] = (codes[sample.code] ?? 0) + 1;
      const last = list[0] ?? null; // listSamples returns newest first
      return {
        providerId: provider.id,
        label: provider.label,
        samples: list.length,
        ok,
        degraded,
        down,
        availability: answered === 0 ? null : ok / answered,
        p50LatencyMs: percentile(latencies, 50),
        p95LatencyMs: percentile(latencies, 95),
        lastStatus: last ? (last.status as GuardianProbeStatus) : null,
        lastSeenAt: last ? last.at : null,
        codes,
      };
    });

    return {
      windowMs,
      from,
      to,
      samples: samples.length,
      runs: runs.length,
      incidents: runs.filter((run) => run.summary?.incident).length,
      providers: reports,
    };
  }

  async function status() {
    const [runs, breakers, health] = await Promise.all([
      store.listRuns({ limit: 1 }).catch(() => []),
      breaker.snapshotAll(providers.map((p) => p.id)).catch(() => ({})),
      store.health().catch(() => ({ ok: false, detail: 'unreachable' })),
    ]);
    return {
      instanceId,
      storeKind: store.kind,
      capabilities: store.capabilities,
      storeHealth: health,
      // Describe the catalogue this monitor actually probes, not the global one.
      providers: providers.map((provider) => ({
        id: provider.id,
        label: provider.label,
        kind: provider.kind,
        endpoint: provider.endpoint,
        docsUrl: provider.docsUrl ?? null,
        requiresEnv: provider.requiresEnv,
        cost: provider.cost,
      })),
      breakers,
      lastRun: runs[0] ?? null,
      watched: providers.length,
      metered: [...METERED_PROVIDER_IDS].filter((id) => Boolean(index[id] ?? PROVIDER_INDEX[id])),
    };
  }

  return { runOnce, verifyProvider, analytics, status, breaker, limiter, instanceId };
}

export type GuardianMonitor = ReturnType<typeof createGuardianMonitor>;
