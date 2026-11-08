/**
 * Autonomous Intelligence Orchestrator — bounded and deterministic.
 *
 * The planner is rule-based on purpose: intent detection and step selection are
 * code, not a model's suggestion. A model can later *explain* a plan, but it can
 * never add a tool, raise a limit or approve an action.
 *
 * Every task carries a plan, an allowlist, hard limits and a maximum iteration
 * count. Running out of budget produces `failed: BUDGET_EXCEEDED`, not another
 * loop. A tool that needs approval pauses the task instead of acting.
 */
import { detectLanguage, languageInstruction } from './language.js';
import { LifeError } from './modelFabric.js';
import { nowIso, randomId } from './store.js';

export const DEFAULT_LIMITS = { maxSteps: 8, maxToolCalls: 4, maxIterations: 2 };
export const DEFAULT_TOOLS = ['project.list', 'project.read', 'project.search'];

export function createOrchestrator({
  store,
  security,
  memory,
  tools,
  verification,
  experiences = null,
  skills = null,
  graph = null,
  clock = () => new Date(),
  userId = 'local',
} = {}) {
  if (!store || !security || !memory || !tools || !verification) {
    throw new Error('orchestrator needs store, security, memory, tools and verification');
  }

  const now = () => nowIso(clock);

  const detectIntent = (objective) => {
    const text = String(objective || '').toLowerCase();
    const intents = [];
    if (/\b(run|execute)\b[^.]*\b(test|tests|suite)\b/.test(text)) intents.push('run-tests');
    const readMatch = text.match(/\b(?:read|open|inspect|show)\s+([\w./-]+\.[a-z]{1,6})/);
    if (readMatch) intents.push(`read:${readMatch[1]}`);
    const searchMatch = objective.match(/\b(?:search|find|grep)\s+(?:for\s+)?["“']?([^"”'\n]{2,60})/i);
    if (searchMatch) intents.push(`search:${searchMatch[1].trim()}`);
    if (/\b(list|inventory|tree|structure)\b/.test(text)) intents.push('list');
    if (/\b(review|analyse|analyze|audit)\b/.test(text)) intents.push('review');
    return intents.length > 0 ? intents : ['review'];
  };

  const planFor = ({ objective, allowedTools, limits }) => {
    const intents = detectIntent(objective);
    const steps = [
      { kind: 'plan', title: 'Understand the objective', detail: intents.join(', ') },
      { kind: 'retrieve', title: 'Retrieve relevant memories', detail: objective.slice(0, 200) },
    ];
    const wanted = new Set();
    for (const intent of intents) {
      if (intent === 'list' || intent === 'review') wanted.add('project.list');
      if (intent.startsWith('read:')) wanted.add('project.read');
      if (intent.startsWith('search:')) wanted.add('project.search');
      if (intent === 'run-tests') wanted.add('tests.run');
    }
    if (wanted.size === 0) wanted.add('project.list');

    for (const toolId of wanted) {
      const allowed = allowedTools.includes(toolId);
      const detail = intentDetailFor(toolId, intents, objective);
      steps.push({
        kind: 'tool',
        title: allowed ? `Use ${toolId}` : `Skip ${toolId}`,
        tool: toolId,
        detail: allowed ? detail : 'not in this task\'s allowlist',
        skipped: !allowed,
      });
    }
    steps.push({ kind: 'verify', title: 'Verify the result against evidence' });
    steps.push({ kind: 'finalize', title: 'Record the outcome' });

    const max = Math.max(2, Math.min(Number(limits.maxSteps) || DEFAULT_LIMITS.maxSteps, 12));
    if (steps.length > max) {
      return { steps: steps.slice(0, max), truncated: true, intents };
    }
    return { steps, truncated: false, intents };
  };

  const insertStep = (taskId, seq, step, status = 'pending') => {
    const id = randomId('step');
    store.run(
      `insert into task_steps (id, task_id, seq, kind, title, status, tool, input, output, error, started_at, finished_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, null, null, null, null)`,
      [id, taskId, seq, step.kind, String(step.title).slice(0, 200), status, step.tool ?? null, JSON.stringify(step.detail ?? null)],
    );
    return id;
  };

  const createTask = ({
    objective,
    taskType = 'general',
    language = null,
    allowedTools = DEFAULT_TOOLS,
    limits = {},
  } = {}) => {
    security.require('tasks.write');
    const text = String(objective || '').trim();
    if (text.length < 3) throw new LifeError('INVALID_OBJECTIVE', 'Describe the objective in a few words.', { status: 400 });
    if (text.length > 2000) throw new LifeError('INVALID_OBJECTIVE', 'That objective is too long.', { status: 400 });

    const known = new Set(tools.list().map((tool) => tool.id));
    const requested = (Array.isArray(allowedTools) ? allowedTools : DEFAULT_TOOLS).filter((id) => {
      if (!known.has(id)) {
        throw new LifeError('UNKNOWN_TOOL', `That tool does not exist: ${id}`, { status: 400 });
      }
      return true;
    });
    const resolvedLimits = {
      maxSteps: clamp(limits.maxSteps, 2, 12, DEFAULT_LIMITS.maxSteps),
      maxToolCalls: clamp(limits.maxToolCalls, 0, 8, DEFAULT_LIMITS.maxToolCalls),
      maxIterations: clamp(limits.maxIterations, 1, 4, DEFAULT_LIMITS.maxIterations),
    };
    const detected = language || detectLanguage(text).language;
    const plan = planFor({ objective: text, allowedTools: requested, limits: resolvedLimits });

    const id = randomId('task');
    const stamp = now();
    store.tx(() => {
      store.run(
        `insert into tasks (id, user_id, objective, language, status, plan, allowed_tools, limits, result,
          verification_id, error, created_at, updated_at)
         values (?, ?, ?, ?, 'planned', ?, ?, ?, null, null, null, ?, ?)`,
        [
          id,
          userId,
          text,
          ['en', 'si', 'ta'].includes(detected) ? detected : 'en',
          JSON.stringify({ intents: plan.intents, truncated: plan.truncated, toolType: taskType }),
          JSON.stringify(requested),
          JSON.stringify(resolvedLimits),
          stamp,
          stamp,
        ],
      );
      plan.steps.forEach((step, index) => insertStep(id, index + 1, step, step.skipped ? 'skipped' : 'pending'));
    });
    security.audit('task.created', { subject: id, detail: { taskType, tools: requested } });
    return getTask(id);
  };

  const getTask = (id, { steps = true } = {}) => {
    const row = store.queryOne('select * from tasks where id = ? and user_id = ?', [id, userId]);
    if (!row) throw new LifeError('TASK_NOT_FOUND', 'No such task.', { status: 404 });
    const task = hydrateTask(row);
    if (steps) {
      task.steps = store
        .queryAll('select * from task_steps where task_id = ? order by seq', [id])
        .map(hydrateStep);
    }
    return task;
  };

  const listTasks = ({ limit = 20 } = {}) =>
    store
      .queryAll('select * from tasks where user_id = ? order by created_at desc limit ?', [userId, Math.min(Number(limit) || 20, 100)])
      .map(hydrateTask);

  const cancelTask = (id) => {
    const task = getTask(id, { steps: false });
    if (['completed', 'failed', 'cancelled'].includes(task.status)) return task;
    store.run('update tasks set status = ?, updated_at = ? where id = ? and user_id = ?', ['cancelled', now(), id, userId]);
    security.audit('task.cancelled', { severity: 'warning', subject: id });
    return getTask(id);
  };

  /** Pause a task on a tool that needs an approval; the UI turns this into a prompt. */
  const pendingApproval = (task, toolId, capability) => {
    const approval = security.requestApproval({ subjectType: 'task', subjectId: task.id, note: toolId });
    store.run('update tasks set status = ?, updated_at = ? where id = ? and user_id = ?', [
      'awaiting_approval',
      now(),
      task.id,
      userId,
    ]);
    return { approval, capability };
  };

  const run = async (taskId, { approvalId = null, toolApprovals = {}, execute = null } = {}) => {
    security.require('tasks.write');
    const task = getTask(taskId);
    if (['completed', 'cancelled'].includes(task.status)) {
      throw new LifeError('TASK_FINISHED', 'That task already finished.', { status: 409 });
    }
    store.run('update tasks set status = ?, updated_at = ? where id = ? and user_id = ?', ['running', now(), taskId, userId]);

    const toolCalls = new Map();
    const outputs = [];
    let toolCallCount = 0;
    let iterations = 0;
    let failed = null;

    for (const step of task.steps) {
      if (step.status === 'skipped') continue;
      // Only real work counts against the iteration budget: planning and
      // bookkeeping steps must not consume a task's allowance.
      if (step.kind === 'tool') {
        iterations += 1;
        if (iterations > task.limits.maxIterations * Math.max(1, task.limits.maxToolCalls)) {
          failed = { code: 'BUDGET_EXCEEDED', message: 'Iteration budget exhausted.' };
          break;
        }
      }
      store.run('update task_steps set status = ?, started_at = ? where id = ?', ['running', now(), step.id]);
      try {
        if (step.kind === 'plan') {
          store.run('update task_steps set status = ?, output = ?, finished_at = ? where id = ?', [
            'completed',
            JSON.stringify({ intents: task.plan.intents }),
            now(),
            step.id,
          ]);
        } else if (step.kind === 'retrieve') {
          const result = await memory.search({ query: task.objective, limit: 5 });
          const summary = result.results.map((entry) => ({ id: entry.memory.id, title: entry.memory.title, score: entry.score }));
          outputs.push({ step: step.id, kind: 'memory', summary });
          store.run('update task_steps set status = ?, output = ?, finished_at = ? where id = ?', [
            'completed',
            JSON.stringify({ strategy: result.strategy, memories: summary }),
            now(),
            step.id,
          ]);
          for (const entry of summary) {
            if (graph) {
              graph.link({ from: { type: 'memory', id: entry.id }, relation: 'MEMORY_SUPPORTS_TASK', to: { type: 'task', id: taskId } });
            }
          }
        } else if (step.kind === 'tool') {
          const tool = tools.get(step.tool);
          const calls = toolCalls.get(step.tool) ?? 0;
          if (calls >= 2) {
            store.run('update task_steps set status = ?, error = ?, finished_at = ? where id = ?', [
              'skipped',
              'max calls per tool reached',
              now(),
              step.id,
            ]);
            continue;
          }
          if (toolCallCount >= task.limits.maxToolCalls) {
            store.run('update task_steps set status = ?, error = ?, finished_at = ? where id = ?', [
              'skipped',
              'tool budget exhausted',
              now(),
              step.id,
            ]);
            continue;
          }
          if (tool.level === 'execute' || tool.level === 'network') {
            const capability = tool.level === 'execute' ? 'tools.execute' : 'network.fetch';
            const supplied = toolApprovals[step.tool] ?? (tool.level === 'execute' ? approvalId : null);
            try {
              security.require(capability, { approvalId: supplied });
            } catch (error) {
              const pending = pendingApproval(task, step.tool, capability);
              store.run('update task_steps set status = ?, error = ?, finished_at = ? where id = ?', [
                'pending',
                `approval required: ${capability}`,
                now(),
                step.id,
              ]);
              return { task: getTask(taskId), paused: true, ...pending };
            }
          }
          toolCalls.set(step.tool, calls + 1);
          toolCallCount += 1;
          const input = toolInput(step.tool, task, step);
          const result = await tools.invoke(step.tool, input, { approvalId: toolApprovals[step.tool] ?? approvalId });
          outputs.push({ step: step.id, kind: 'tool', tool: step.tool, input, result });
          store.run('update task_steps set status = ?, input = ?, output = ?, finished_at = ? where id = ?', [
            'completed',
            JSON.stringify(input),
            JSON.stringify(result).slice(0, 20_000),
            now(),
            step.id,
          ]);
        } else if (step.kind === 'verify') {
          store.run('update task_steps set status = ?, finished_at = ? where id = ?', ['completed', now(), step.id]);
        } else {
          store.run('update task_steps set status = ?, finished_at = ? where id = ?', ['completed', now(), step.id]);
        }
      } catch (error) {
        const code = error?.code || 'STEP_FAILED';
        store.run('update task_steps set status = ?, error = ?, finished_at = ? where id = ?', ['failed', code, now(), step.id]);
        failed = { code, message: error?.message || 'step failed' };
        break;
      }
    }

    // A stopped task leaves nothing looking "in progress" to the UI.
    if (failed) {
      store.run(
        `update task_steps set status = 'skipped', error = coalesce(error, 'not run: task stopped'), finished_at = ?
         where task_id = ? and status in ('pending','running')`,
        [now(), taskId],
      );
    }

    // Evidence is captured from what actually ran.
    for (const output of outputs) {
      if (output.kind === 'tool') {
        verification.evidence({
          taskId,
          kind: 'file',
          label: `${output.tool} output`,
          detail: JSON.stringify(output.result).slice(0, 4000),
        });
      } else {
        verification.evidence({
          taskId,
          kind: 'memory',
          label: 'memory retrieval',
          detail: JSON.stringify(output.summary).slice(0, 2000),
        });
      }
    }

    const checks = [
      { name: 'steps-completed', passed: !failed, detail: failed ? failed.code : 'all steps completed' },
      {
        name: 'outputs-captured',
        passed: outputs.length > 0,
        detail: `${outputs.length} captured`,
      },
      ...outputs
        .filter((output) => output.kind === 'tool' && output.tool === 'tests.run')
        .map((output) => ({
          name: 'tests-exit-code',
          passed: output.result.exitCode === 0,
          detail: `exit ${output.result.exitCode}`,
        })),
    ];
    if (execute) {
      const extra = await execute({ task, outputs });
      checks.push({ name: 'task-executor', passed: Boolean(extra?.passed), detail: extra?.detail ?? null });
    }

    const record = verification.verify({ taskId, checks, notes: `language:${task.language} ${languageInstruction(task.language)}` });
    const status = failed ? 'failed' : record.status === 'failed' ? 'failed' : 'completed';
    const result = {
      summary: buildSummary(task, outputs, failed),
      outputs: outputs.map((output) => ({ tool: output.tool ?? 'memory', step: output.step })),
      verification: record.status,
      failed,
    };
    store.run('update tasks set status = ?, result = ?, verification_id = ?, error = ?, updated_at = ? where id = ? and user_id = ?', [
      status,
      JSON.stringify(result),
      record.id,
      failed ? failed.code : null,
      now(),
      taskId,
      userId,
    ]);

    let experience = null;
    if (experiences) {
      experience = experiences.capture({
        taskId,
        taskType: String(task.plan?.toolType || 'general'),
        objective: task.objective,
        summary: result.summary,
        verificationId: record.id,
        lessons: failed ? [`failed at ${failed.code}`] : ['completed with evidence'],
        tags: task.allowedTools,
      });
    }

    security.audit('task.finished', { severity: failed ? 'warning' : 'info', subject: taskId, detail: { status, verification: record.status } });
    return { task: getTask(taskId), verification: record, experience: experience?.experience ?? null, paused: false };
  };

  /** A task can reference an approved skill; that link is what the graph records. */
  const attachSkill = (taskId, skillId) => {
    if (!skills) throw new LifeError('SKILLS_UNAVAILABLE', 'Skill service is not available.', { status: 503 });
    const skill = skills.get(skillId);
    if (skill.status !== 'active') {
      throw new LifeError('SKILL_NOT_ACTIVE', 'Only an active skill can be attached to a task.', { status: 409 });
    }
    if (graph) {
      graph.link({ from: { type: 'task', id: taskId }, relation: 'TASK_USED_SKILL', to: { type: 'skill', id: skillId } });
    }
    security.audit('task.skill_attached', { subject: taskId, detail: { skillId, version: skill.currentVersion } });
    return { taskId, skillId, version: skill.currentVersion };
  };

  return { createTask, run, getTask, listTasks, cancelTask, attachSkill, detectIntent, DEFAULT_LIMITS, DEFAULT_TOOLS };
}

function toolInput(toolId, task, step) {
  const intents = task.plan?.intents ?? [];
  if (toolId === 'project.read') {
    const readIntent = intents.find((intent) => String(intent).startsWith('read:'));
    return { path: readIntent ? readIntent.slice(5) : '' };
  }
  if (toolId === 'project.search') {
    const searchIntent = intents.find((intent) => String(intent).startsWith('search:'));
    return { query: searchIntent ? searchIntent.slice(7) : task.objective };
  }
  if (toolId === 'tests.run') return { script: 'test:workspace' };
  if (toolId === 'project.list') return {};
  return {};
}

function intentDetailFor(toolId, intents, objective) {
  if (toolId === 'project.list') return 'list the project tree';
  if (toolId === 'project.read') return intents.find((intent) => String(intent).startsWith('read:')) ?? objective.slice(0, 120);
  if (toolId === 'project.search') return intents.find((intent) => String(intent).startsWith('search:')) ?? objective.slice(0, 120);
  if (toolId === 'tests.run') return 'run the workspace test script';
  return '';
}

function buildSummary(task, outputs, failed) {
  if (failed) return `Task did not finish: ${failed.code} — ${failed.message}`;
  const lines = [`Objective: ${task.objective}`];
  for (const output of outputs) {
    if (output.kind === 'memory') lines.push(`Related memories: ${output.summary.length}`);
    if (output.kind === 'tool' && output.tool === 'project.list') lines.push(`Files seen: ${output.result.files?.length ?? 0}`);
    if (output.kind === 'tool' && output.tool === 'project.read') lines.push(`Read ${output.result.path} (${output.result.bytes} bytes)`);
    if (output.kind === 'tool' && output.tool === 'project.search') lines.push(`Search hits: ${output.result.hits?.length ?? 0}`);
    if (output.kind === 'tool' && output.tool === 'tests.run') lines.push(`Tests exit code: ${output.result.exitCode}`);
  }
  return lines.join('\n');
}

function hydrateTask(row) {
  return {
    id: row.id,
    objective: row.objective,
    language: row.language,
    status: row.status,
    plan: safeParse(row.plan, {}),
    allowedTools: safeParse(row.allowed_tools, []),
    limits: safeParse(row.limits, DEFAULT_LIMITS),
    result: row.result ? safeParse(row.result, null) : null,
    verificationId: row.verification_id,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function hydrateStep(row) {
  return {
    id: row.id,
    seq: row.seq,
    kind: row.kind,
    title: row.title,
    status: row.status,
    tool: row.tool,
    input: row.input ? safeParse(row.input, null) : null,
    output: row.output ? safeParse(row.output, null) : null,
    error: row.error,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
  };
}

function clamp(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(number)));
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
