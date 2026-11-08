/**
 * NOVA NEXUS / L.I.F.E. — engine assembly.
 *
 * One function wires the modules with explicit dependencies, so every part is
 * independently testable and the router is only HTTP plumbing.
 */
import { defaultDbPath, isEphemeralPath, openLifeStore } from './store.js';
import { createSecurityKernel } from './security.js';
import { detectHardware } from './hardware.js';
import { createModelFabric } from './modelFabric.js';
import { createMemoryService } from './memory.js';
import { createGraphService } from './graph.js';
import { createToolRegistry } from './tools.js';
import { createVerificationService } from './verification.js';
import { createExperienceService } from './experiences.js';
import { createSkillService } from './skills.js';
import { createOrchestrator } from './orchestrator.js';
import { createSimulationService, SIMULATION_LIMITS } from './simulation.js';
import { createBenchmarkService } from './benchmarks.js';
import { detectLanguage } from './language.js';

export function createLifeEngine({
  env = process.env,
  dbPath = null,
  root = process.cwd(),
  fetchImpl = (...args) => fetch(...args),
  clock = () => new Date(),
  userId = 'local',
  inMemory = false,
} = {}) {
  const path = inMemory ? ':memory:' : dbPath || defaultDbPath(env);
  const store = openLifeStore({ path, clock });
  const security = createSecurityKernel({ store, clock, userId });
  security.ensureDefaults();

  const hardware = detectHardware({ env });
  const fabric = createModelFabric({
    env,
    fetchImpl,
    hardware,
    clock,
    approvalCheck: (id) => security.getApproval(id)?.decision === 'approved',
  });
  const graph = createGraphService({ store, clock, userId });
  const memory = createMemoryService({ store, security, fabric, clock, userId });
  const tools = createToolRegistry({ root, security, env, fetchImpl, clock });
  const verification = createVerificationService({ store, security, graph, clock, userId });
  const experiences = createExperienceService({ store, security, graph, clock, userId });
  const skills = createSkillService({ store, security, graph, clock, userId });
  const orchestrator = createOrchestrator({
    store,
    security,
    memory,
    tools,
    verification,
    experiences,
    skills,
    graph,
    clock,
    userId,
  });
  const simulation = createSimulationService({ root, security, env, clock });
  const benchmarks = createBenchmarkService({ store, memory, clock, userId });
  benchmarks.seed();

  const status = ({ language = 'en' } = {}) => {
    const memoryCounts = memory.counts();
    const providers = fabric.providers();
    const localProviders = providers.filter((provider) => provider.kind === 'local');
    return {
      name: 'NOVA NEXUS',
      architecture: 'NOVA L.I.F.E. — Local Intelligence, Feedback & Evolution',
      version: 1,
      schemaVersion: store.schemaVersion,
      storage: {
        engine: 'sqlite',
        fts: store.hasFts,
        path:
          path === ':memory:' ? ':memory:' : isEphemeralPath(path) ? 'temporary file' : 'local file',
        // Serverless runtimes have no writable project directory, so the engine
        // falls back to a temp database. Say so instead of implying durability.
        ephemeral: isEphemeralPath(path),
      },
      mode: { localOnly: fabric.localOnly, executionEnabled: String(env.NOVA_LIFE_ALLOW_EXECUTE || '') === '1' },
      hardware: hardware.profile,
      language: detectLanguage(language).language,
      providers: {
        total: providers.length,
        localConfigured: localProviders.filter((provider) => provider.configured).length,
        cloudConfigured: providers.filter((provider) => provider.kind === 'cloud' && provider.configured).length,
      },
      counts: {
        memories: memoryCounts.total,
        byCategory: memoryCounts.byCategory,
        tasks: store.queryOne('select count(*) as count from tasks where user_id = ?', [userId])?.count ?? 0,
        experiences: store.queryOne('select count(*) as count from experiences where user_id = ?', [userId])?.count ?? 0,
        skills: store.queryOne('select count(*) as count from skills where user_id = ?', [userId])?.count ?? 0,
        activeSkills: store.queryOne("select count(*) as count from skills where user_id = ? and status = 'active'", [userId])?.count ?? 0,
        verifications: store.queryOne('select count(*) as count from verification_records where user_id = ?', [userId])?.count ?? 0,
        auditEvents: store.queryOne('select count(*) as count from audit_events where user_id = ?', [userId])?.count ?? 0,
      },
      permissions: security.listGrants(),
      graph: graph.stats(),
      simulation: SIMULATION_LIMITS,
      tools: tools.list(),
    };
  };

  return {
    store,
    security,
    hardware,
    fabric,
    memory,
    graph,
    tools,
    verification,
    experiences,
    skills,
    orchestrator,
    simulation,
    benchmarks,
    status,
    close: () => store.close(),
  };
}
