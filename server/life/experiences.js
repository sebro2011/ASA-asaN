/**
 * Experience Replay Engine.
 *
 * Captures what actually happened in a task, but only calls it a success when an
 * independent verification record says so. Replay eligibility is a separate,
 * stricter flag: unverified experiences are stored (they are useful history) but
 * are never replayed as if they were proven.
 */
import { tokenize } from './language.js';
import { LifeError } from './modelFabric.js';
import { nowIso, randomId } from './store.js';

export function createExperienceService({ store, security, graph = null, clock = () => new Date(), userId = 'local' } = {}) {
  if (!store || !security) throw new Error('experience service needs a store and a security kernel');

  const outcomeFrom = (verification) => {
    if (!verification) return 'failure';
    if (verification.status === 'verified') return 'success';
    if (verification.status === 'partially_verified') return 'partial';
    return 'failure';
  };

  const capture = ({
    taskId = null,
    taskType = 'general',
    objective,
    summary,
    verificationId = null,
    lessons = [],
    tags = [],
  } = {}) => {
    if (!objective || !summary) throw new LifeError('INVALID_EXPERIENCE', 'An experience needs an objective and a summary.', { status: 400 });
    if (taskId) {
      const existing = store.queryOne('select id from experiences where task_id = ? and user_id = ?', [taskId, userId]);
      if (existing) return { experience: get(existing.id), duplicate: true };
    }
    const verification = verificationId ? verifyLookup(verificationId) : null;
    const outcome = outcomeFrom(verification);
    const verified = verification?.status === 'verified';
    const replayable = verified && (outcome === 'success' || outcome === 'partial');
    const record = {
      id: randomId('exp'),
      user_id: userId,
      task_id: taskId,
      task_type: String(taskType).slice(0, 80),
      objective: String(objective).slice(0, 400),
      execution_summary: String(summary).slice(0, 4000),
      outcome,
      lessons: JSON.stringify((Array.isArray(lessons) ? lessons : []).map((lesson) => String(lesson).slice(0, 300)).slice(0, 10)),
      evidence_ids: JSON.stringify(verification?.evidenceIds ?? []),
      verified: verified ? 1 : 0,
      replayable: replayable ? 1 : 0,
      score: replayable ? 1 : verified ? 0.6 : 0.2,
      tags: JSON.stringify((Array.isArray(tags) ? tags : []).map((tag) => String(tag).slice(0, 32)).slice(0, 10)),
      created_at: nowIso(clock),
    };
    store.run(
      `insert into experiences (id, user_id, task_id, task_type, objective, execution_summary, outcome,
        lessons, evidence_ids, verified, replayable, score, tags, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.user_id,
        record.task_id,
        record.task_type,
        record.objective,
        record.execution_summary,
        record.outcome,
        record.lessons,
        record.evidence_ids,
        record.verified,
        record.replayable,
        record.score,
        record.tags,
        record.created_at,
      ],
    );
    if (graph && taskId) {
      graph.link({ from: { type: 'task', id: taskId }, relation: 'TASK_PRODUCED_EXPERIENCE', to: { type: 'experience', id: record.id } });
    }
    security.audit('experience.captured', { subject: record.id, detail: { outcome, verified } });
    return { experience: get(record.id), duplicate: false };
  };

  const verifyLookup = (verificationId) =>
    store.queryOne('select * from verification_records where id = ? and user_id = ?', [verificationId, userId]);

  const get = (id) => {
    const row = store.queryOne('select * from experiences where id = ? and user_id = ?', [id, userId]);
    if (!row) throw new LifeError('EXPERIENCE_NOT_FOUND', 'No such experience.', { status: 404 });
    return hydrate(row);
  };

  const list = ({ taskType = null, outcome = null, limit = 30 } = {}) => {
    const params = [userId];
    let sql = 'select * from experiences where user_id = ?';
    if (taskType) {
      sql += ' and task_type = ?';
      params.push(taskType);
    }
    if (outcome) {
      sql += ' and outcome = ?';
      params.push(outcome);
    }
    sql += ' order by created_at desc limit ?';
    params.push(Math.min(Number(limit) || 30, 100));
    return store.queryAll(sql, params).map(hydrate);
  };

  /** Similarity is explainable: shared tokens + task type + replay eligibility. */
  const findSimilar = ({ taskType = null, objective = '', limit = 5 } = {}) => {
    const wanted = new Set(tokenize(objective));
    const rows = store.queryAll('select * from experiences where user_id = ? order by created_at desc limit 300', [userId]);
    return rows
      .map((row) => {
        const tokens = new Set(tokenize(`${row.objective} ${row.execution_summary} ${row.tags}`));
        const overlap = wanted.size === 0 ? 0 : [...wanted].filter((token) => tokens.has(token)).length / wanted.size;
        const typeBonus = taskType && row.task_type === taskType ? 0.25 : 0;
        const verifiedBonus = row.verified === 1 ? 0.1 : 0;
        return { experience: hydrate(row), similarity: Number(Math.min(overlap * 0.7 + typeBonus + verifiedBonus, 1).toFixed(3)) };
      })
      .filter((entry) => entry.similarity > 0)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, Math.min(Number(limit) || 5, 20));
  };

  /** Replay returns the verified record, not a live model call. */
  const replayPlan = (id) => {
    const experience = get(id);
    if (!experience.replayable) {
      throw new LifeError('EXPERIENCE_NOT_REPLAYABLE', 'Only verified experiences can be replayed.', { status: 409 });
    }
    security.audit('experience.replayed', { subject: id });
    return {
      experience,
      steps: [
        { title: 'Reuse the verified approach', detail: experience.executionSummary },
        { title: 'Re-check the outcome in the current project', detail: 'Replay never assumes the old result still holds.' },
      ],
      requiresVerification: true,
    };
  };

  const evaluate = (id) => {
    const experience = get(id);
    const checks = [
      { name: 'has-objective', passed: experience.objective.length > 0, detail: experience.objective.slice(0, 80) },
      { name: 'evidence-present', passed: experience.evidenceIds.length > 0, detail: `${experience.evidenceIds.length} evidence ids` },
      { name: 'independent-verification', passed: experience.verified, detail: experience.verified ? 'verified record linked' : 'not verified' },
      { name: 'replay-eligible', passed: experience.replayable, detail: experience.replayable ? 'eligible' : 'not eligible' },
    ];
    store.tx(() => {
      for (const check of checks) {
        store.run(
          `insert into experience_evaluations (id, experience_id, check_name, passed, detail, evaluated_at)
           values (?, ?, ?, ?, ?, ?)`,
          [randomId('eval'), experience.id, check.name, check.passed ? 1 : 0, check.detail, nowIso(clock)],
        );
      }
    });
    return { experienceId: experience.id, checks, passed: checks.every((check) => check.passed) };
  };

  return { capture, get, list, findSimilar, replayPlan, evaluate };
}

function hydrate(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    taskType: row.task_type,
    objective: row.objective,
    executionSummary: row.execution_summary,
    outcome: row.outcome,
    lessons: safeArray(row.lessons),
    evidenceIds: safeArray(row.evidence_ids),
    verified: row.verified === 1,
    replayable: row.replayable === 1,
    score: row.score,
    tags: safeArray(row.tags),
    createdAt: row.created_at,
  };
}

function safeArray(value) {
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
