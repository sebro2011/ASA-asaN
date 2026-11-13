/**
 * Guardian HTTP surface — `/api/guardian/*`.
 *
 * Access tiers:
 *
 *  | route            | who                          | why                          |
 *  |------------------|------------------------------|------------------------------|
 *  | GET /health      | anyone (rate limited)        | a status endpoint, no secrets |
 *  | GET /status      | anyone (rate limited)        | dashboard read model          |
 *  | GET /analytics   | anyone (rate limited)        | aggregate numbers only        |
 *  | GET /providers   | anyone (rate limited)        | catalogue + breaker states    |
 *  | GET /runs,/audit | administrator                | who did what                  |
 *  | POST /run        | administrator or cron secret | spends provider quota         |
 *  | GET /cron        | cron secret only             | Vercel scheduled sweep        |
 *  | POST /recovery   | administrator                | changes fleet state           |
 *  | GET /config      | administrator                | env readiness, names only     |
 *
 * Every response is `no-store`, every failure is a JSON body with a `code`, and
 * no handler can return a stack trace or an environment value.
 */

import { Router, type Request, type Response } from 'express';
import { createGuardianStore } from './store';
import { createGuardianMonitor } from './monitor';
import { createRecovery, RECOVERY_ACTIONS, HUMAN_ONLY_OPERATIONS } from './recovery';
import {
  authorizeAdmin,
  authorizeCron,
  callerKey,
  envReadiness,
  scrubSecrets,
} from './security';
import { createFleetRateLimiter } from './rateLimit';
import { clearConnectorCache } from '../forge/scienceConnectors';
import type { GuardianStore } from './types';

export interface GuardianRuntimeOverrides {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
  now?: () => number;
  random?: () => number;
  store?: GuardianStore;
  instanceId?: string;
  timeoutMs?: number;
  concurrency?: number;
  namespace?: string;
  /** Restrict/replace the probe catalogue (tests, or a trimmed deployment). */
  providers?: import('./types').ProviderDefinition[];
}

export function createGuardianRuntime(overrides: GuardianRuntimeOverrides = {}) {
  const env = overrides.env ?? (typeof process !== 'undefined' ? process.env : {});
  const now = overrides.now ?? Date.now;
  const selection = overrides.store
    ? { store: overrides.store, reason: 'Injected store (test or custom wiring).', missing: [] }
    : createGuardianStore(env, {
        fetchImpl: overrides.fetchImpl,
        now,
        namespace: overrides.namespace,
      });

  const limiter = createFleetRateLimiter(selection.store, { now });
  const monitor = createGuardianMonitor({
    store: selection.store,
    env,
    fetchImpl: overrides.fetchImpl,
    now,
    random: overrides.random,
    instanceId: overrides.instanceId,
    timeoutMs: overrides.timeoutMs,
    concurrency: overrides.concurrency,
    limiter,
    providers: overrides.providers,
  });
  const recovery = createRecovery({
    store: selection.store,
    monitor,
    env,
    now,
    cacheClearers: {
      'forge:science-connectors': () => clearConnectorCache(),
    },
  });

  return { env, now, selection, store: selection.store, monitor, recovery, limiter };
}

export type GuardianRuntime = ReturnType<typeof createGuardianRuntime>;

const WINDOWS: Record<string, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '6h': 6 * 60 * 60_000,
  '24h': 24 * 60 * 60_000,
  '7d': 7 * 24 * 60 * 60_000,
};

function failure(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ ok: false, code, error: message });
}

export function createGuardianRouter(runtime: GuardianRuntime) {
  const router = Router();
  const { store, monitor, recovery, env, now } = runtime;

  router.use((_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    next();
  });

  /**
   * Inbound limiting is per caller and fleet-wide (the store counter), so ten
   * instances cannot each grant a caller a fresh allowance. Returns false when
   * the response has already been written, so every caller must `return` on it.
   */
  async function gate(
    req: Request,
    res: Response,
    bucket: string,
    limit: number,
    windowMs: number,
  ): Promise<boolean> {
    const key = callerKey(req.headers as Record<string, unknown>, req.ip || 'unknown');
    const decision = await runtime.limiter.check(`${bucket}:${key}`, { limit, windowMs });
    if (decision.allowed) return true;
    res.setHeader('Retry-After', String(Math.max(1, Math.ceil((decision.resetAt - now()) / 1000))));
    failure(res, 429, 'RATE_LIMITED', 'Too many Guardian requests from this caller.');
    return false;
  }

  /** Read routes share a generous budget; a dashboard polls a handful of them. */
  const readOK = (req: Request, res: Response) => gate(req, res, 'guardian:read', 120, 60_000);

  async function requireAdmin(req: Request, res: Response): Promise<string | null> {
    const auth = authorizeAdmin(req.headers as Record<string, unknown>, env);
    if (auth.ok) return auth.actor;
    await store
      .appendAudit({
        at: now(),
        actor: 'anonymous',
        action: 'auth-failure',
        target: `${req.method} ${req.path}`,
        severity: 'warning',
        detail: { code: auth.code, ip: callerKey(req.headers as Record<string, unknown>, 'unknown') },
      })
      .catch(() => {});
    failure(res.status(auth.status), auth.status, auth.code, auth.message);
    return null;
  }

  router.get('/health', async (req, res) => {
    if (!(await readOK(req, res))) return;
    try {
      const status = await monitor.status();
      const lastSummary = status.lastRun?.summary ?? null;
      const down = status.providers.length
        ? Object.values(status.breakers).filter((breaker) => breaker?.state === 'open').length
        : 0;
      res.json({
        ok: true,
        distributed: status.capabilities.distributed,
        storeKind: status.storeKind,
        storeHealth: status.storeHealth,
        watched: status.watched,
        circuitsOpen: down,
        incident: Boolean(lastSummary?.incident),
        lastRunAt: status.lastRun?.startedAt ?? null,
        lastRunTrigger: status.lastRun?.trigger ?? null,
        checkedAt: now(),
      });
    } catch {
      failure(res, 503, 'GUARDIAN_UNAVAILABLE', 'The Guardian could not read its own state.');
    }
  });

  router.get('/status', async (req, res) => {
    if (!(await readOK(req, res))) return;
    try {
      const [status, analytics] = await Promise.all([
        monitor.status(),
        monitor.analytics({ windowMs: WINDOWS['24h'] }),
      ]);
      const running = res.locals?.guardianRun ?? null;
      res.json({
        ok: true,
        instanceId: status.instanceId,
        store: {
          kind: status.storeKind,
          capabilities: status.capabilities,
          reason: runtime.selection.reason,
          missing: runtime.selection.missing,
          health: status.storeHealth,
          describe: store.describe(),
        },
        providers: status.providers,
        breakers: status.breakers,
        lastRun: status.lastRun,
        running,
        analytics: {
          windowMs: analytics.windowMs,
          samples: analytics.samples,
          runs: analytics.runs,
          incidents: analytics.incidents,
          providers: analytics.providers.map((entry) => ({
            providerId: entry.providerId,
            availability: entry.availability,
            p95LatencyMs: entry.p95LatencyMs,
            lastStatus: entry.lastStatus,
            lastSeenAt: entry.lastSeenAt,
          })),
        },
        generatedAt: now(),
      });
    } catch {
      failure(res, 503, 'GUARDIAN_UNAVAILABLE', 'The Guardian could not assemble its status.');
    }
  });

  router.get('/providers', async (req, res) => {
    if (!(await readOK(req, res))) return;
    try {
      const status = await monitor.status();
      res.json({ ok: true, providers: status.providers, breakers: status.breakers, metered: status.metered });
    } catch {
      failure(res, 503, 'GUARDIAN_UNAVAILABLE', 'The provider catalogue could not be read.');
    }
  });

  router.get('/analytics', async (req, res) => {
    if (!(await readOK(req, res))) return;
    const requested = String(req.query.window ?? '24h');
    const windowMs = WINDOWS[requested] ?? (Number.parseInt(requested, 10) || WINDOWS['24h']);
    try {
      const analytics = await monitor.analytics({ windowMs });
      res.json({ ok: true, ...analytics });
    } catch {
      failure(res, 503, 'GUARDIAN_UNAVAILABLE', 'Analytics could not be computed.');
    }
  });

  router.get('/runs', async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const limit = Math.max(1, Math.min(Number.parseInt(String(req.query.limit ?? '20'), 10) || 20, 100));
    try {
      res.json({ ok: true, runs: await store.listRuns({ limit }) });
    } catch {
      failure(res, 503, 'GUARDIAN_UNAVAILABLE', 'Run history could not be read.');
    }
  });

  router.get('/audit', async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    const limit = Math.max(1, Math.min(Number.parseInt(String(req.query.limit ?? '50'), 10) || 50, 200));
    const severity = ['info', 'warning', 'critical'].includes(String(req.query.severity))
      ? (String(req.query.severity) as 'info' | 'warning' | 'critical')
      : undefined;
    try {
      res.json({
        ok: true,
        entries: await store.listAudit({
          limit,
          severity,
          action: req.query.action ? String(req.query.action) : undefined,
          target: req.query.target ? String(req.query.target) : undefined,
        }),
      });
    } catch {
      failure(res, 503, 'GUARDIAN_UNAVAILABLE', 'The audit log could not be read.');
    }
  });

  async function performRun(
    req: Request,
    res: Response,
    trigger: 'manual' | 'schedule',
    actor: string,
  ) {
    const inbound = await runtime.limiter.check(`guardian:run:${actor}`, { limit: trigger === 'schedule' ? 6 : 12, windowMs: 60_000 });
    if (!inbound.allowed) {
      failure(res, 429, 'RATE_LIMITED', 'Too many sweeps requested; the fleet budget protects provider quotas.');
      return;
    }
    const body = (req.body ?? {}) as { includeMetered?: unknown; only?: unknown };
    const includeMetered = body.includeMetered === true;
    const only = Array.isArray(body.only) ? body.only.filter((id): id is string => typeof id === 'string') : undefined;
    try {
      const result = await monitor.runOnce({ trigger, actor, includeMetered, only });
      if (!result.ran) {
        res.status(200).json({
          ok: true,
          ran: false,
          reason: result.reason,
          holder: result.holder,
          distributed: store.capabilities.distributed,
        });
        return;
      }
      res.json({ ok: true, ran: true, summary: result.summary });
    } catch (error) {
      const message = scrubSecrets(error instanceof Error ? error.message : 'unknown', env);
      failure(res, 500, 'RUN_FAILED', `The sweep failed: ${message}`);
    }
  }

  router.post('/run', async (req, res) => {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    await performRun(req, res, 'manual', actor);
  });

  router.get('/cron', async (req, res) => {
    const auth = authorizeCron(req.headers as Record<string, unknown>, env);
    if (!auth.ok) {
      failure(res, auth.status, auth.code, auth.message);
      return;
    }
    await performRun(req, res, 'schedule', auth.actor);
  });

  router.post('/recovery', async (req, res) => {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const budget = await runtime.limiter.check(`guardian:recovery:${actor}`, { limit: 5, windowMs: 60_000 });
    if (!budget.allowed) {
      failure(res, 429, 'RATE_LIMITED', 'Too many recovery actions; wait a minute before retrying.');
      return;
    }
    const body = (req.body ?? {}) as { action?: unknown; providerId?: unknown };
    const action = typeof body.action === 'string' ? body.action : '';
    const providerId = typeof body.providerId === 'string' ? body.providerId : undefined;
    if (!action) {
      failure(res, 400, 'ACTION_REQUIRED', 'A recovery action id is required.');
      return;
    }
    try {
      const result = await recovery.execute(action, { providerId, actor });
      res.status(result.ok ? 200 : 400).json(result);
    } catch (error) {
      failure(res, 500, 'RECOVERY_FAILED', scrubSecrets(error instanceof Error ? error.message : 'unknown', env));
    }
  });

  router.get('/verify', async (req, res) => {
    const actor = await requireAdmin(req, res);
    if (!actor) return;
    const providerId = String(req.query.provider ?? '');
    if (!providerId) {
      failure(res, 400, 'PROVIDER_REQUIRED', 'A provider id is required.');
      return;
    }
    try {
      const result = await monitor.verifyProvider(providerId, { actor });
      if ('error' in result) {
        failure(res, result.error === 'unknown-provider' ? 404 : 429, result.error.toUpperCase(), result.error);
        return;
      }
      res.json({ ok: true, verified: result.verified, outcome: result.outcome });
    } catch {
      failure(res, 500, 'VERIFY_FAILED', 'The verification probe could not run.');
    }
  });

  router.get('/config', async (req, res) => {
    if (!(await requireAdmin(req, res))) return;
    res.json({
      ok: true,
      env: envReadiness(env),
      store: {
        kind: store.kind,
        capabilities: store.capabilities,
        reason: runtime.selection.reason,
        missing: runtime.selection.missing,
        describe: store.describe(),
      },
      schedule: {
        endpoint: '/api/guardian/cron',
        requiresSecret: 'CRON_SECRET',
        configured: Boolean((env.CRON_SECRET || '').trim()),
        recommended: 'every 10 minutes; cheap sweep unless ?deep=1',
      },
      adminConfigured: Boolean((env.GUARDIAN_ADMIN_TOKEN || '').trim()),
      recoveryActions: RECOVERY_ACTIONS,
      humanOnlyOperations: HUMAN_ONLY_OPERATIONS,
      deployment: {
        environment: env.NODE_ENV || 'development',
        commit: env.VERCEL_GIT_COMMIT_SHA ? String(env.VERCEL_GIT_COMMIT_SHA).slice(0, 7) : null,
        region: env.VERCEL_REGION || null,
      },
    });
  });

  return router;
}

/** Mount point used by `server.ts`. */
export function mountGuardian(app: { use: (path: string, router: Router) => unknown }, runtime?: GuardianRuntime) {
  const resolved = runtime ?? createGuardianRuntime();
  app.use('/api/guardian', createGuardianRouter(resolved));
  return resolved;
}
