/**
 * Skill Evolution Engine.
 *
 * Lifecycle, enforced:
 *
 *   discovered → draft → sandbox_testing → verification → user_approval → active
 *                                                              ↘ deprecated
 *
 * The gates that matter:
 *   - only validated test cases can pass a sandbox run;
 *   - a skill can only reach `verification` if every case passed;
 *   - activation needs BOTH a recorded user approval and a passing run for the
 *     version being activated;
 *   - an instruction set that looks like a jailbreak or an exfiltration attempt
 *     is rejected at submission, before any test runs.
 *
 * What sandbox testing actually does: it validates each declared test case
 * against the skill's input/output schema, and — when the caller supplies an
 * executor (the tests do, with a deterministic one) — runs that executor and
 * checks its output. It does not pretend a schema check is model quality.
 */
import { LifeError } from './modelFabric.js';
import { sanitizeUntrusted } from './security.js';
import { nowIso, randomId } from './store.js';
import { validateSchema } from './verification.js';

export const SKILL_STATES = [
  'discovered',
  'draft',
  'sandbox_testing',
  'verification',
  'user_approval',
  'active',
  'deprecated',
  'rejected',
];

const BLOCKING_SIGNALS = new Set(['instruction-override', 'tool-request', 'exfiltration', 'approval-forgery']);

export function createSkillService({ store, security, graph = null, clock = () => new Date(), userId = 'local' } = {}) {
  if (!store || !security) throw new Error('skill service needs a store and a security kernel');

  const capabilityIds = new Set(security.capabilities.map((capability) => capability.id));

  const getRow = (id) => {
    const row = store.queryOne('select * from skills where id = ? and user_id = ?', [id, userId]);
    if (!row) throw new LifeError('SKILL_NOT_FOUND', 'No such skill.', { status: 404 });
    return row;
  };

  const versionsFor = (id) =>
    store
      .queryAll('select * from skill_versions where skill_id = ? order by version desc', [id])
      .map((row) => ({
        version: row.version,
        instructions: row.instructions,
        steps: safeArray(row.steps),
        testCases: safeArray(row.test_cases),
        verification: row.verification ? safeParse(row.verification) : null,
        approvedBy: row.approved_by,
        approvedAt: row.approved_at,
        createdAt: row.created_at,
      }));

  const hydrate = (row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    status: row.status,
    currentVersion: row.current_version,
    permissions: safeArray(row.permissions),
    dependencies: safeArray(row.dependencies),
    inputSchema: safeParse(row.input_schema, {}),
    outputSchema: safeParse(row.output_schema, {}),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    versions: versionsFor(row.id),
  });

  const nextVersion = (skillId) => {
    const row = store.queryOne('select max(version) as max from skill_versions where skill_id = ?', [skillId]);
    return (row?.max ?? 0) + 1;
  };

  const saveVersion = (skillId, { instructions, steps = [], testCases = [] }, status = 'draft') => {
    const version = nextVersion(skillId);
    store.run(
      `insert into skill_versions (id, skill_id, version, instructions, steps, test_cases, verification, created_at)
       values (?, ?, ?, ?, ?, ?, null, ?)`,
      [randomId('skv'), skillId, version, String(instructions).slice(0, 8000), JSON.stringify(steps), JSON.stringify(testCases), nowIso(clock)],
    );
    store.run('update skills set status = ?, updated_at = ? where id = ?', [status, nowIso(clock), skillId]);
    return version;
  };

  const createCandidate = ({
    name,
    description,
    instructions = '',
    steps = [],
    permissions = [],
    dependencies = [],
    inputSchema = {},
    outputSchema = {},
    testCases = [],
  } = {}) => {
    if (!name || String(name).trim().length < 3) {
      throw new LifeError('INVALID_SKILL', 'A skill needs a name of at least three characters.', { status: 400 });
    }
    if (!description || String(description).trim().length < 10) {
      throw new LifeError('INVALID_SKILL', 'A skill needs a description of at least ten characters.', { status: 400 });
    }
    for (const permission of permissions) {
      if (!capabilityIds.has(permission)) {
        throw new LifeError('UNKNOWN_PERMISSION', `That permission does not exist: ${permission}`, { status: 400 });
      }
    }
    const existing = store.queryOne('select id from skills where user_id = ? and lower(name) = lower(?)', [userId, String(name).trim()]);
    if (existing) return { skill: hydrate(getRow(existing.id)), duplicate: true };

    const id = randomId('skill');
    const stamp = nowIso(clock);
    store.tx(() => {
      store.run(
        `insert into skills (id, user_id, name, description, status, current_version, permissions, dependencies,
          input_schema, output_schema, created_at, updated_at)
         values (?, ?, ?, ?, 'discovered', 0, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          userId,
          String(name).trim().slice(0, 120),
          String(description).trim().slice(0, 1000),
          JSON.stringify(permissions),
          JSON.stringify(dependencies),
          JSON.stringify(inputSchema),
          JSON.stringify(outputSchema),
          stamp,
          stamp,
        ],
      );
      saveVersion(id, { instructions: instructions || 'Draft instructions pending review.', steps, testCases }, 'draft');
    });
    security.audit('skill.candidate_created', { subject: id, detail: { name } });
    return { skill: hydrate(getRow(id)), duplicate: false };
  };

  /** Propose skills from repeated, verified experiences of the same task type. */
  const discoverCandidates = ({ minOccurrences = 2 } = {}) => {
    const rows = store.queryAll(
      `select task_type, count(*) as count, group_concat(objective, ' | ') as objectives
       from experiences where user_id = ? and verified = 1
       group by task_type having count >= ?`,
      [userId, Math.max(2, Number(minOccurrences) || 2)],
    );
    return rows.map((row) => {
      const existing = store.queryOne('select id from skills where user_id = ? and lower(name) like lower(?)', [
        userId,
        `%${row.task_type}%`,
      ]);
      return {
        taskType: row.task_type,
        occurrences: row.count,
        sampleObjectives: String(row.objectives || '').split(' | ').slice(0, 3),
        existingSkillId: existing?.id ?? null,
      };
    });
  };

  const submit = (id) => {
    const skill = getRow(id);
    if (!['discovered', 'draft', 'rejected'].includes(skill.status)) {
      throw new LifeError('INVALID_TRANSITION', `A ${skill.status} skill cannot be submitted again.`, { status: 409 });
    }
    const current = versionsFor(id)[0];
    if (!current) throw new LifeError('NO_VERSION', 'Save a draft version first.', { status: 409 });
    if (current.testCases.length === 0) {
      throw new LifeError('NO_TEST_CASES', 'A skill needs at least one test case before sandbox testing.', { status: 422 });
    }
    const scan = sanitizeUntrusted(`${current.instructions}\n${JSON.stringify(current.steps)}`);
    const blocked = scan.signals.filter((signal) => BLOCKING_SIGNALS.has(signal));
    if (blocked.length > 0 || scan.redacted.length > 0) {
      store.tx(() => {
        store.run('update skills set status = ?, updated_at = ? where id = ?', ['rejected', nowIso(clock), id]);
        saveVersion(id, current, 'rejected');
      });
      security.audit('skill.rejected', { severity: 'critical', subject: id, detail: { signals: blocked, secrets: scan.redacted } });
      throw new LifeError(
        'SKILL_REJECTED',
        'That skill contains instructions that could escalate permissions or leak data, so it was rejected.',
        { status: 422, details: { signals: blocked } },
      );
    }
    store.run('update skills set status = ?, updated_at = ? where id = ?', ['sandbox_testing', nowIso(clock), id]);
    security.audit('skill.submitted', { subject: id });
    return hydrate(getRow(id));
  };

  /**
   * Sandbox test. Deterministic; no model call.
   * @param {{ execute?: (input: any, context: {steps: any[], instructions: string}) => any }} options
   */
  const test = async (id, { execute = null } = {}) => {
    const skill = getRow(id);
    if (!['sandbox_testing', 'verification', 'draft'].includes(skill.status)) {
      throw new LifeError('INVALID_TRANSITION', `A ${skill.status} skill cannot be tested.`, { status: 409 });
    }
    const version = versionsFor(id)[0];
    if (!version) throw new LifeError('NO_VERSION', 'No version to test.', { status: 409 });
    const inputSchema = safeParse(skill.input_schema, {});
    const outputSchema = safeParse(skill.output_schema, {});
    const runId = randomId('run');
    const startedAt = nowIso(clock);
    const checks = [];

    for (const testCase of version.testCases) {
      const name = String(testCase?.name || 'case');
      const inputCheck = validateSchema(testCase?.input ?? {}, inputSchema);
      checks.push({
        name: `${name}: input`,
        passed: inputCheck.valid,
        detail: inputCheck.valid ? 'ok' : inputCheck.errors.join('; '),
      });
      if (!testCase?.expect || typeof testCase.expect !== 'object') {
        checks.push({ name: `${name}: expectation`, passed: false, detail: 'no expectation declared' });
        continue;
      }
      const outputCheck = validateSchema(testCase.expect, outputSchema);
      checks.push({
        name: `${name}: expected output`,
        passed: outputCheck.valid,
        detail: outputCheck.valid ? 'ok' : outputCheck.errors.join('; '),
      });
      if (execute) {
        try {
          const actual = await execute(testCase.input ?? {}, { steps: version.steps, instructions: version.instructions });
          const actualCheck = validateSchema(actual, outputSchema);
          checks.push({
            name: `${name}: executor output`,
            passed: actualCheck.valid,
            detail: actualCheck.valid ? 'ok' : actualCheck.errors.join('; '),
          });
        } catch (error) {
          checks.push({ name: `${name}: executor`, passed: false, detail: error?.message || 'executor threw' });
        }
      }
    }

    const passed = checks.length > 0 && checks.every((check) => check.passed);
    store.tx(() => {
      store.run(
        `insert into skill_runs (id, skill_id, version, task_id, status, details, started_at, finished_at)
         values (?, ?, ?, null, ?, ?, ?, ?)`,
        [runId, id, version.version, passed ? 'passed' : 'failed', JSON.stringify({ checks, executed: Boolean(execute) }), startedAt, nowIso(clock)],
      );
      store.run('update skill_versions set verification = ? where skill_id = ? and version = ?', [
        JSON.stringify({ passed, runId, checks, testedAt: nowIso(clock), executed: Boolean(execute) }),
        id,
        version.version,
      ]);
      store.run('update skills set status = ?, updated_at = ? where id = ?', [
        passed ? 'verification' : 'draft',
        nowIso(clock),
        id,
      ]);
    });
    security.audit('skill.tested', { severity: passed ? 'info' : 'warning', subject: id, detail: { passed, checks: checks.length } });
    return { skill: hydrate(getRow(id)), runId, passed, checks, executed: Boolean(execute) };
  };

  const requestApproval = (id) => {
    const skill = getRow(id);
    if (skill.status !== 'verification') {
      throw new LifeError('INVALID_TRANSITION', 'Only a verified skill can be sent for approval.', { status: 409 });
    }
    store.run('update skills set status = ?, updated_at = ? where id = ?', ['user_approval', nowIso(clock), id]);
    const approval = security.requestApproval({ subjectType: 'skill', subjectId: id, note: skill.name });
    return { skill: hydrate(getRow(id)), approval };
  };

  const approve = (id, { decision = 'approved', note = null } = {}) => {
    const skill = getRow(id);
    if (skill.status !== 'user_approval') {
      throw new LifeError('INVALID_TRANSITION', 'That skill is not waiting for approval.', { status: 409 });
    }
    const approval = security.decide({ subjectType: 'skill', subjectId: id, decision, note });
    if (decision === 'rejected') {
      store.run('update skills set status = ?, updated_at = ? where id = ?', ['rejected', nowIso(clock), id]);
    }
    return { skill: hydrate(getRow(id)), approval };
  };

  const activate = (id) => {
    const skill = getRow(id);
    const approval = security.approvalFor('skill', id);
    if (!approval || approval.decision !== 'approved') {
      throw new LifeError('APPROVAL_REQUIRED', 'A skill cannot become active without a recorded approval.', { status: 403 });
    }
    const version = versionsFor(id)[0];
    const verification = version?.verification;
    if (!verification || !verification.passed) {
      throw new LifeError('NOT_VERIFIED', 'The newest version has not passed sandbox testing.', { status: 409 });
    }
    const permissions = safeArray(skill.permissions);
    const missing = permissions.filter((permission) => !security.isGranted(permission));
    if (missing.length > 0) {
      throw new LifeError('PERMISSION_DENIED', `Grant these permissions first: ${missing.join(', ')}`, {
        status: 403,
        details: { missing },
      });
    }
    store.tx(() => {
      store.run('update skills set status = ?, current_version = ?, updated_at = ? where id = ?', [
        'active',
        version.version,
        nowIso(clock),
        id,
      ]);
      store.run('update skill_versions set approved_by = ?, approved_at = ? where skill_id = ? and version = ?', [
        approval.id,
        nowIso(clock),
        id,
        version.version,
      ]);
      if (graph) {
        graph.link({
          from: { type: 'skill', id },
          relation: 'SKILL_PRODUCED_VERSION',
          to: { type: 'skill', id: `${id}#v${version.version}` },
        });
      }
    });
    security.audit('skill.activated', { severity: 'warning', subject: id, detail: { version: version.version } });
    return hydrate(getRow(id));
  };

  const rollback = (id, version) => {
    const skill = getRow(id);
    if (skill.status !== 'active' && skill.status !== 'deprecated') {
      throw new LifeError('INVALID_TRANSITION', 'Only an active skill can be rolled back.', { status: 409 });
    }
    const target = store.queryOne('select * from skill_versions where skill_id = ? and version = ?', [id, Number(version)]);
    if (!target) throw new LifeError('VERSION_NOT_FOUND', 'No such skill version.', { status: 404 });
    const verification = target.verification ? safeParse(target.verification) : null;
    if (!verification?.passed) {
      throw new LifeError('NOT_VERIFIED', 'That version did not pass verification, so it cannot be activated.', { status: 409 });
    }
    store.run('update skills set current_version = ?, status = ?, updated_at = ? where id = ?', [
      target.version,
      'active',
      nowIso(clock),
      id,
    ]);
    security.audit('skill.rolled_back', { severity: 'warning', subject: id, detail: { version: target.version } });
    return hydrate(getRow(id));
  };

  /**
   * Save a new draft version. An active skill keeps its active version pointer
   * while the new version goes through testing again; the skill's status moves to
   * `draft` until the new version is approved, so nothing untested is served.
   */
  const updateDraft = (id, patch = {}) => {
    const skill = getRow(id);
    if (skill.status === 'deprecated') {
      throw new LifeError('INVALID_TRANSITION', 'A deprecated skill cannot be edited.', { status: 409 });
    }
    const current = versionsFor(id)[0] ?? {};
    return store.tx(() => {
      saveVersion(
        id,
        {
          instructions: patch.instructions ?? current.instructions ?? '',
          steps: patch.steps ?? current.steps ?? [],
          testCases: patch.testCases ?? current.testCases ?? [],
        },
        'draft',
      );
      security.audit('skill.updated', { subject: id });
      return hydrate(getRow(id));
    });
  };

  const deprecate = (id) => {
    store.run('update skills set status = ?, updated_at = ? where id = ?', ['deprecated', nowIso(clock), id]);
    security.audit('skill.deprecated', { severity: 'warning', subject: id });
    return hydrate(getRow(id));
  };

  const get = (id) => hydrate(getRow(id));

  const list = ({ status = null, limit = 50 } = {}) => {
    const params = [userId];
    let sql = 'select * from skills where user_id = ?';
    if (status) {
      sql += ' and status = ?';
      params.push(status);
    }
    sql += ' order by updated_at desc limit ?';
    params.push(Math.min(Number(limit) || 50, 200));
    return store.queryAll(sql, params).map(hydrate).map(({ versions, ...rest }) => ({ ...rest, versionCount: versions.length }));
  };

  const runs = (id) =>
    store
      .queryAll('select * from skill_runs where skill_id = ? order by started_at desc limit 20', [id])
      .map((row) => ({
        id: row.id,
        version: row.version,
        status: row.status,
        details: safeParse(row.details, {}),
        startedAt: row.started_at,
        finishedAt: row.finished_at,
      }));

  return {
    states: SKILL_STATES,
    createCandidate,
    discoverCandidates,
    submit,
    test,
    requestApproval,
    approve,
    activate,
    rollback,
    updateDraft,
    deprecate,
    get,
    list,
    runs,
  };
}

function safeArray(value) {
  if (Array.isArray(value)) return value;
  try {
    const parsed = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeParse(value, fallback = {}) {
  try {
    const parsed = JSON.parse(value ?? 'null');
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
