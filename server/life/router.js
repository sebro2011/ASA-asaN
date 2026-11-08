/**
 * HTTP surface for the L.I.F.E. engine.
 *
 * Conventions match the rest of the app: JSON in, JSON out, `{ error, code }` on
 * failure, no secrets or absolute paths in responses. The engine is
 * single-user (`local`); a multi-user deployment must put these routes behind
 * authentication and the Supabase RLS migration.
 */
import express from 'express';
import { createLifeEngine } from './index.js';
import { LifeError } from './modelFabric.js';

export function createLifeRouter({ engine = null, env = process.env, root = process.cwd() } = {}) {
  const router = express.Router();
  let instance = engine;
  const getEngine = () => {
    if (!instance) instance = createLifeEngine({ env, root });
    return instance;
  };

  const wrap = (handler) => async (req, res) => {
    try {
      const result = await handler(req, res, getEngine());
      if (res.headersSent) return;
      if (result === undefined) return res.status(204).end();
      return res.json(result);
    } catch (error) {
      const status = error instanceof LifeError ? error.status : error?.code === 'PERMISSION_DENIED' ? 403 : error?.code === 'APPROVAL_REQUIRED' ? 403 : 500;
      const body = {
        error: error?.message || 'Engine error',
        code: error?.code || 'LIFE_ERROR',
        ...(error?.capability ? { capability: error.capability.id } : {}),
        ...(error?.details ? { details: error.details } : {}),
      };
      if (status >= 500) console.error('[NOVA L.I.F.E.]', error);
      return res.status(status).json(body);
    }
  };

  /* ------------------------------------------------------------- status */

  router.get('/status', wrap((req, _res, life) => life.status({ language: req.query.lang || 'en' })));

  router.get('/hardware', wrap((_req, _res, life) => life.hardware));

  router.get('/config', wrap((_req, _res, life) => ({
    localOnly: life.fabric.localOnly,
    executionEnabled: String(env.NOVA_LIFE_ALLOW_EXECUTE || '') === '1',
    providers: life.fabric.providers(),
    hardware: life.hardware.profile,
    database: { fts: life.store.hasFts, schemaVersion: life.store.schemaVersion },
  })));

  /* ---------------------------------------------------------- providers */

  router.get('/providers', wrap((_req, _res, life) => ({ providers: life.fabric.providers() })));
  router.post('/providers/health', wrap(async (_req, _res, life) => life.fabric.health({ force: true })));
  router.get('/providers/:id/capabilities', wrap(async (req, _res, life) => life.fabric.capabilities(req.params.id)));
  router.post('/providers/select', wrap((req, _res, life) =>
    life.fabric.selectModel({
      complexity: req.body?.complexity || 'standard',
      requireJson: Boolean(req.body?.json),
      needTools: Boolean(req.body?.tools),
    }),
  ));

  /* ------------------------------------------------------------- memory */

  router.get('/memory', wrap((req, _res, life) => ({
    counts: life.memory.counts(),
    memories: life.memory.list({
      category: req.query.category ? String(req.query.category) : null,
      limit: Number(req.query.limit) || 50,
      offset: Number(req.query.offset) || 0,
    }),
    permissions: life.memory.permissions(),
    retention: life.memory.retention,
    categories: life.memory.categories,
  })));

  router.post('/memory', wrap((req, _res, life) => life.memory.add(req.body || {})));
  router.get('/memory/search', wrap(async (req, _res, life) =>
    life.memory.search({ query: String(req.query.q || ''), categories: req.query.category ? [String(req.query.category)] : null, limit: Number(req.query.limit) || 10 }),
  ));
  router.post('/memory/summarize', wrap((req, _res, life) => life.memory.summarize({ category: req.body?.category ?? null, limit: req.body?.limit ?? 20 })));
  router.post('/memory/expire', wrap((_req, _res, life) => life.memory.expire()));
  router.get('/memory/:id', wrap((req, _res, life) => ({ memory: life.memory.get(req.params.id), versions: life.memory.listVersions(req.params.id) })));
  router.patch('/memory/:id', wrap((req, _res, life) => life.memory.update(req.params.id, req.body || {})));
  router.post('/memory/:id/correct', wrap((req, _res, life) => life.memory.correct(req.params.id, req.body || {})));
  router.post('/memory/:id/revert', wrap((req, _res, life) => life.memory.revert(req.params.id, req.body?.version)));
  router.delete('/memory/:id', wrap((req, _res, life) => life.memory.remove(req.params.id)));

  /* -------------------------------------------------------------- tasks */

  router.post('/tasks', wrap((req, _res, life) => life.orchestrator.createTask(req.body || {})));
  router.get('/tasks', wrap((req, _res, life) => ({ tasks: life.orchestrator.listTasks({ limit: Number(req.query.limit) || 20 }) })));
  router.get('/tasks/:id', wrap((req, _res, life) => life.orchestrator.getTask(req.params.id)));
  router.post('/tasks/:id/run', wrap(async (req, _res, life) =>
    life.orchestrator.run(req.params.id, {
      approvalId: req.body?.approvalId ?? null,
      toolApprovals: req.body?.toolApprovals ?? {},
    }),
  ));
  router.post('/tasks/:id/cancel', wrap((req, _res, life) => life.orchestrator.cancelTask(req.params.id)));
  router.post('/tasks/:id/skill', wrap ((req, _res, life) => life.orchestrator.attachSkill(req.params.id, req.body?.skillId)));

  /* -------------------------------------------------------- experiences */

  router.get('/experiences', wrap((req, _res, life) => ({
    experiences: life.experiences.list({ taskType: req.query.type || null, outcome: req.query.outcome || null, limit: Number(req.query.limit) || 30 }),
  })));
  router.post('/experiences', wrap((req, _res, life) => life.experiences.capture(req.body || {})));
  router.get('/experiences/similar', wrap((req, _res, life) =>
    life.experiences.findSimilar({ taskType: req.query.type || null, objective: String(req.query.q || ''), limit: Number(req.query.limit) || 5 }),
  ));
  router.get('/experiences/:id', wrap((req, _res, life) => ({ experience: life.experiences.get(req.params.id), evaluations: life.experiences.evaluate(req.params.id) })));
  router.post('/experiences/:id/replay', wrap((req, _res, life) => life.experiences.replayPlan(req.params.id)));

  /* ------------------------------------------------------------- skills */

  router.get('/skills', wrap((req, _res, life) => ({ skills: life.skills.list({ status: req.query.status || null }), states: life.skills.states })));
  router.post('/skills', wrap((req, _res, life) => life.skills.createCandidate(req.body || {})));
  router.get('/skills/candidates/discover', wrap((_req, _res, life) => ({ candidates: life.skills.discoverCandidates() })));
  router.get('/skills/:id', wrap((req, _res, life) => ({ skill: life.skills.get(req.params.id), runs: life.skills.runs(req.params.id) })));
  router.patch('/skills/:id', wrap((req, _res, life) => ({ skill: life.skills.updateDraft(req.params.id, req.body || {}) })));
  router.post('/skills/:id/submit', wrap((req, _res, life) => ({ skill: life.skills.submit(req.params.id) })));
  router.post('/skills/:id/test', wrap((req, _res, life) => life.skills.test(req.params.id)));
  router.post('/skills/:id/request-approval', wrap((req, _res, life) => life.skills.requestApproval(req.params.id)));
  router.post('/skills/:id/approve', wrap((req, _res, life) => life.skills.approve(req.params.id, req.body || {})));
  router.post('/skills/:id/activate', wrap((req, _res, life) => ({ skill: life.skills.activate(req.params.id) })));
  router.post('/skills/:id/rollback', wrap((req, _res, life) => ({ skill: life.skills.rollback(req.params.id, req.body?.version) })));
  router.post('/skills/:id/deprecate', wrap((req, _res, life) => ({ skill: life.skills.deprecate(req.params.id) })));

  /* ------------------------------------------------- verification & proof */

  router.get('/verifications', wrap((req, _res, life) => ({ verifications: life.verification.recent({ limit: Number(req.query.limit) || 20 }) })));
  router.get('/verifications/:id', wrap((req, _res, life) => life.verification.get(req.params.id)));
  router.get('/tasks/:id/verification', wrap((req, _res, life) => ({ verifications: life.verification.forTask(req.params.id) })));
  router.get('/evidence', wrap((req, _res, life) => ({ evidence: life.verification.listEvidence({ taskId: req.query.taskId || null, limit: Number(req.query.limit) || 50 }) })));

  /* ----------------------------------------------------------- security */

  router.get('/security', wrap((_req, _res, life) => ({
    permissions: life.security.listGrants(),
    audit: life.security.auditLog({ limit: 50 }),
    capabilities: life.security.capabilities,
    simulation: life.simulation.list(),
    tools: life.tools.list(),
    executionEnabled: String(env.NOVA_LIFE_ALLOW_EXECUTE || '') === '1',
  })));
  router.post('/security/grants', wrap((req, _res, life) => life.security.setGrant(String(req.body?.capability || ''), Boolean(req.body?.granted))));
  router.post('/security/approvals', wrap((req, _res, life) =>
    life.security.decide({
      subjectType: req.body?.subjectType,
      subjectId: req.body?.subjectId,
      decision: req.body?.decision,
      note: req.body?.note ?? null,
    }),
  ));
  router.get('/security/audit', wrap((req, _res, life) => ({ events: life.security.auditLog({ limit: Number(req.query.limit) || 100 }) })));

  /* --------------------------------------------------------- simulation */

  router.get('/simulation', wrap((_req, _res, life) => life.simulation.list()));
  router.post('/simulation/preview', wrap(async (req, _res, life) => life.simulation.preview({ files: req.body?.files })));
  router.post('/simulation/workspace', wrap(async (req, _res, life) =>
    life.simulation.createWorkspace({ files: req.body?.files, copyProject: Boolean(req.body?.copyProject) }),
  ));
  router.post('/simulation/run-tests', wrap(async (req, _res, life) =>
    life.simulation.runTests({ workspaceId: req.body?.workspaceId, script: req.body?.script, approvalId: req.body?.approvalId ?? null }),
  ));
  router.post('/simulation/apply', wrap(async (req, _res, life) =>
    life.simulation.apply({ files: req.body?.files, approvalId: req.body?.approvalId ?? null, tests: req.body?.tests ?? null }),
  ));
  router.post('/simulation/rollback', wrap(async (req, _res, life) => life.simulation.rollback(String(req.body?.changeSetId || ''))));

  /* --------------------------------------------------------- benchmarks */

  router.get('/benchmarks', wrap((_req, _res, life) => ({ dataset: life.benchmarks.dataset, cases: life.benchmarks.cases(), history: life.benchmarks.history() })));
  router.post('/benchmarks/run', wrap(async (req, _res, life) => life.benchmarks.run({ suites: req.body?.suites ?? null })));

  /* -------------------------------------------------------------- graph */

  router.get('/graph', wrap((req, _res, life) => {
    if (req.query.type && req.query.id) {
      return life.graph.neighbors(String(req.query.type), String(req.query.id), {
        depth: Number(req.query.depth) || 1,
        relation: req.query.relation ? String(req.query.relation) : null,
      });
    }
    return life.graph.stats();
  }));
  router.post('/graph/link', wrap((req, _res, life) => life.graph.link(req.body || {})));

  /* --------------------------------------------------------------- data */

  router.get('/export', wrap((_req, res, life) => {
    res.setHeader('Content-Disposition', 'attachment; filename="nova-life-export.json"');
    return life.store.exportAll();
  }));
  router.delete('/data', wrap((_req, _res, life) => life.store.deleteUser('local')));
  router.post('/backup', wrap((_req, _res, life) => {
    try {
      return { path: 'local backup created', file: life.store.backup().split('/').pop() };
    } catch (error) {
      throw new LifeError('BACKUP_FAILED', error.message, { status: 500 });
    }
  }));

  return router;
}

/** Exported for tests: a fresh engine without touching the real database. */
export function createTestLifeEngine(options = {}) {
  return createLifeEngine({ inMemory: true, ...options });
}
