/**
 * Proof & Trust Engine.
 *
 * A model's sentence "done" is not evidence. Verification runs independent
 * checks — real exit codes, real file state, real schema validation — and only
 * then writes a record. If no check ran, the status is `unverified`, never
 * `verified` by default.
 */
import { createHash } from 'node:crypto';
import { nowIso, randomId } from './store.js';
import { LifeError } from './modelFabric.js';

export function createVerificationService({ store, security, graph = null, clock = () => new Date(), userId = 'local' } = {}) {
  if (!store || !security) throw new Error('verification service needs a store and a security kernel');

  const evidence = ({ taskId = null, kind = 'manual', label, detail = '' }) => {
    if (!['test', 'file', 'command', 'source', 'model', 'memory', 'manual', 'simulation'].includes(kind)) {
      throw new LifeError('INVALID_EVIDENCE_KIND', `Unknown evidence kind: ${kind}`, { status: 400 });
    }
    if (!label || String(label).trim().length === 0) {
      throw new LifeError('INVALID_EVIDENCE', 'Evidence needs a label.', { status: 400 });
    }
    const text = typeof detail === 'string' ? detail : JSON.stringify(detail);
    const record = {
      id: randomId('ev'),
      task_id: taskId,
      user_id: userId,
      kind,
      label: String(label).slice(0, 200),
      detail: text.slice(0, 20_000),
      digest: createHash('sha256').update(text).digest('hex').slice(0, 32),
      created_at: nowIso(clock),
    };
    store.run(
      `insert into evidence_records (id, task_id, user_id, kind, label, detail, digest, created_at)
       values (?, ?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.task_id, record.user_id, record.kind, record.label, record.detail, record.digest, record.created_at],
    );
    if (graph && taskId) {
      graph.link({ from: { type: 'evidence', id: record.id }, relation: 'EVIDENCE_VERIFIES_RESULT', to: { type: 'task', id: taskId } });
    }
    return { id: record.id, kind: record.kind, label: record.label, digest: record.digest, createdAt: record.created_at };
  };

  /**
   * Run checks and persist the outcome.
   *
   * Each check is `{ name, passed, detail }` or `{ name, run: () => { passed, detail } }`.
   * A throwing check is a failure, not an exception that stops the record.
   */
  const verify = ({ taskId, checks = [], notes = null } = {}) => {
    if (!taskId) throw new LifeError('INVALID_TASK', 'Verification needs a task id.', { status: 400 });
    const performed = [];
    const errors = [];
    let passedCount = 0;

    for (const check of checks) {
      const name = String(check.name || 'unnamed-check');
      let passed = Boolean(check.passed);
      let detail = check.detail ?? null;
      if (typeof check.run === 'function') {
        try {
          const result = check.run();
          passed = Boolean(result?.passed);
          detail = result?.detail ?? null;
        } catch (error) {
          passed = false;
          detail = error?.message || 'check threw';
        }
      }
      performed.push({ name, passed, detail });
      if (passed) passedCount += 1;
      else errors.push(`${name}: ${detail || 'failed'}`);
    }

    let status;
    if (performed.length === 0) status = 'unverified';
    else if (passedCount === performed.length) status = 'verified';
    else if (passedCount > 0) status = 'partially_verified';
    else status = 'failed';
    if (performed.length === 0) errors.push('no independent checks were performed');

    const evidenceIds = store
      .queryAll('select id from evidence_records where task_id = ? and user_id = ?', [taskId, userId])
      .map((row) => row.id);

    const record = {
      id: randomId('ver'),
      task_id: taskId,
      user_id: userId,
      status,
      checks_performed: JSON.stringify(performed),
      evidence_ids: JSON.stringify(evidenceIds),
      errors: JSON.stringify(errors),
      notes,
      verified_at: nowIso(clock),
    };
    store.run(
      `insert into verification_records (id, task_id, user_id, status, checks_performed, evidence_ids, errors, notes, verified_at)
       values (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        record.id,
        record.task_id,
        record.user_id,
        record.status,
        record.checks_performed,
        record.evidence_ids,
        record.errors,
        record.notes,
        record.verified_at,
      ],
    );
    security.audit('verification.recorded', {
      severity: status === 'verified' ? 'info' : 'warning',
      subject: taskId,
      detail: { status, checks: performed.length },
    });
    return hydrate(record);
  };

  const get = (id) => {
    const row = store.queryOne('select * from verification_records where id = ? and user_id = ?', [id, userId]);
    return row ? hydrate(row) : null;
  };

  const forTask = (taskId) =>
    store.queryAll('select * from verification_records where task_id = ? and user_id = ? order by verified_at desc', [taskId, userId]).map(hydrate);

  const listEvidence = ({ taskId = null, limit = 50 } = {}) =>
    (taskId
      ? store.queryAll('select * from evidence_records where task_id = ? and user_id = ? order by created_at desc limit ?', [
          taskId,
          userId,
          Math.min(Number(limit) || 50, 200),
        ])
      : store.queryAll('select * from evidence_records where user_id = ? order by created_at desc limit ?', [userId, Math.min(Number(limit) || 50, 200)])
    ).map((row) => ({
      id: row.id,
      taskId: row.task_id,
      kind: row.kind,
      label: row.label,
      detail: row.detail,
      digest: row.digest,
      createdAt: row.created_at,
    }));

  const recent = ({ limit = 20 } = {}) =>
    store
      .queryAll('select * from verification_records where user_id = ? order by verified_at desc limit ?', [userId, Math.min(Number(limit) || 20, 100)])
      .map(hydrate);

  return { evidence, verify, get, forTask, listEvidence, recent };
}

/* --------------------------------------------------------- check helpers */

/** Minimal JSON-Schema subset: type, required, properties, enum, items. */
export function validateSchema(value, schema) {
  if (!schema || typeof schema !== 'object') return { valid: true, errors: [] };
  const errors = [];
  const type = schema.type;
  const actual = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
  if (type && actual !== type && !(type === 'number' && actual === 'number')) {
    return { valid: false, errors: [`expected ${type}, got ${actual}`] };
  }
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
    errors.push(`expected one of ${schema.enum.join(', ')}`);
  }
  if (type === 'object' && value && typeof value === 'object') {
    for (const key of schema.required || []) {
      if (!(key in value)) errors.push(`missing ${key}`);
    }
    for (const [key, subSchema] of Object.entries(schema.properties || {})) {
      if (key in value) {
        const result = validateSchema(value[key], subSchema);
        errors.push(...result.errors.map((message) => `${key}: ${message}`));
      }
    }
  }
  if (type === 'array' && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => {
      const result = validateSchema(item, schema.items);
      errors.push(...result.errors.map((message) => `[${index}]: ${message}`));
    });
  }
  if (typeof value === 'string' && typeof schema.minLength === 'number' && value.length < schema.minLength) {
    errors.push(`shorter than ${schema.minLength} characters`);
  }
  return { valid: errors.length === 0, errors };
}

export function checkSchema(name, value, schema) {
  const result = validateSchema(value, schema);
  return { name, passed: result.valid, detail: result.valid ? 'schema ok' : result.errors.join('; ') };
}

export function checkNonEmpty(name, value) {
  const text = typeof value === 'string' ? value.trim() : '';
  return { name, passed: text.length > 0, detail: text.length > 0 ? `${text.length} chars` : 'empty' };
}

function hydrate(row) {
  return {
    id: row.id,
    taskId: row.task_id,
    status: row.status,
    checks: safeParse(row.checks_performed, []),
    evidenceIds: safeParse(row.evidence_ids, []),
    errors: safeParse(row.errors, []),
    notes: row.notes,
    verifiedAt: row.verified_at,
  };
}

function safeParse(value, fallback) {
  try {
    const parsed = JSON.parse(value);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}
