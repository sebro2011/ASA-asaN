/**
 * Security & permission kernel.
 *
 * Three rules this file enforces, in code rather than in prose:
 *
 *   1. At boot, the owner receives baseline grants for their own memory, tasks,
 *      project reads and skill activation. Execution, network access and data
 *      transmission are never granted by default.
 *   2. Higher-risk capabilities need a *recorded* user decision. A model cannot
 *      approve its own action; `require()` throws unless an approval row exists.
 *   3. Everything untrusted — memories, documents, model output — passes through
 *      `sanitizeUntrusted()` first, which redacts secrets and flags injection
 *      attempts without silently deleting the content.
 */
import { lstat } from 'node:fs/promises';
import { isAbsolute, join, relative as pathRelative, resolve as pathResolve, sep } from 'node:path';
import { nowIso, randomId } from './store.js';

/** Ordered by risk: each level implies the lower ones are *not* automatically granted. */
export const PERMISSION_LEVELS = ['read', 'write', 'execute', 'network', 'transmit'];

export const RISK = { read: 0, write: 1, execute: 2, network: 3, transmit: 4 };

/** Capabilities the engine knows about. Adding one here is the only way to ask for it. */
export const CAPABILITIES = [
  { id: 'memory.read', level: 'read', label: 'Read memories' },
  { id: 'memory.write', level: 'write', label: 'Create and edit memories' },
  { id: 'memory.delete', level: 'write', label: 'Delete memories' },
  { id: 'tasks.read', level: 'read', label: 'Read tasks and steps' },
  { id: 'tasks.write', level: 'write', label: 'Create and run tasks' },
  { id: 'tools.read', level: 'read', label: 'Read files inside the project' },
  { id: 'tools.execute', level: 'execute', label: 'Run allowlisted test commands' },
  { id: 'network.fetch', level: 'network', label: 'Fetch an allowlisted URL' },
  { id: 'transmit.external', level: 'transmit', label: 'Send data to a cloud model' },
  { id: 'skills.activate', level: 'write', label: 'Activate a skill version' },
  { id: 'simulation.apply', level: 'write', label: 'Apply a simulated change' },
];

const CAPABILITY_BY_ID = new Map(CAPABILITIES.map((capability) => [capability.id, capability]));

/** Capabilities whose use requires an explicit, recorded approval every time. */
const APPROVAL_REQUIRED = new Set(['tools.execute', 'network.fetch', 'transmit.external', 'simulation.apply']);

/* ------------------------------------------------------------- redaction */

const SECRET_PATTERNS = [
  { name: 'openai-style key', pattern: /\b(sk|rk)-[A-Za-z0-9_-]{16,}\b/g },
  { name: 'google api key', pattern: /\bAIza[0-9A-Za-z_-]{20,}\b/g },
  { name: 'github token', pattern: /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{20,}\b/g },
  { name: 'slack token', pattern: /\bxox[abpsr]-[A-Za-z0-9-]{10,}\b/g },
  { name: 'aws access key', pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: 'bearer token', pattern: /\bBearer\s+[A-Za-z0-9._-]{12,}/gi },
  { name: 'private key', pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g },
  { name: 'jwt', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g },
  {
    name: 'credentials in url',
    pattern: /\b([a-z][a-z0-9+.-]*:\/\/)[^\s/@:]+:[^\s/@]+@/gi,
    replace: (_, scheme) => `${scheme}[REDACTED]@`,
  },
  {
    name: 'password assignment',
    pattern: /\b(password|passwd|secret|api[_-]?key|token)\s*[:=]\s*("[^"]{3,}"|'[^']{3,}'|[^\s,;]{3,})/gi,
    replace: (_, key) => `${key}=[REDACTED]`,
  },
];

/** Replace likely credentials with a marker, and report what was found. */
export function redactSecrets(input) {
  const text = typeof input === 'string' ? input : String(input ?? '');
  let output = text;
  const found = [];
  for (const { name, pattern, replace } of SECRET_PATTERNS) {
    pattern.lastIndex = 0;
    if (!pattern.test(output)) continue;
    pattern.lastIndex = 0;
    output = replace ? output.replace(pattern, replace) : output.replace(pattern, `[REDACTED:${name}]`);
    found.push(name);
  }
  return { text: output, redacted: found };
}

export function containsSecret(input) {
  return redactSecrets(input).redacted.length > 0;
}

/* ------------------------------------------------------ untrusted content */

const INJECTION_SIGNALS = [
  { id: 'instruction-override', pattern: /\b(ignore|disregard|forget)\b[^.\n]{0,40}\b(previous|prior|above|earlier)\b[^.\n]{0,20}\b(instruction|prompt|rule)s?\b/i },
  { id: 'system-prompt-probe', pattern: /\b(reveal|show|print|repeat)\b[^.\n]{0,30}\b(system prompt|instructions|hidden rules)\b/i },
  { id: 'role-hijack', pattern: /\b(you are now|from now on you|act as (an? )?(dan|jailbroken|unrestricted))\b/i },
  { id: 'tool-request', pattern: /\b(run|execute|invoke)\b[^.\n]{0,30}\b(shell|bash|command|rm -rf|curl|wget)\b/i },
  { id: 'exfiltration', pattern: /\b(send|post|upload|exfiltrate)\b[^.\n]{0,40}\b(api key|token|credentials|conversation)\b/i },
  { id: 'approval-forgery', pattern: /\b(user (has )?approved|approval granted|admin override)\b/i },
  // Bidirectional and zero-width characters can hide text from a human reviewer.
  { id: 'invisible-unicode', pattern: /[\u200B-\u200F\u202A-\u202E\u2066-\u2069]/ },
];

/**
 * Inspect untrusted text. Returns the redacted text plus signals; callers decide
 * whether to refuse, quote, or ask for confirmation. Nothing is silently dropped.
 */
export function sanitizeUntrusted(input, { maxChars = 20_000 } = {}) {
  const raw = typeof input === 'string' ? input : String(input ?? '');
  const truncated = raw.length > maxChars;
  const { text, redacted } = redactSecrets(raw.slice(0, maxChars));
  const signals = [];
  for (const { id, pattern } of INJECTION_SIGNALS) {
    if (pattern.test(text)) signals.push(id);
  }
  return {
    text,
    redacted,
    signals,
    suspicious: signals.length > 0,
    truncated,
  };
}

/* --------------------------------------------------------- path handling */

/** Resolve `candidate` inside `root`, or throw. NUL bytes and traversal are refused. */
export function resolveInside(root, candidate) {
  const value = typeof candidate === 'string' ? candidate : '';
  if (!value || value.includes('\0')) throw new Error('PATH_INVALID');
  const normalisedRoot = pathResolve(root);
  const resolved = pathResolve(normalisedRoot, value);
  const fromRoot = pathRelative(normalisedRoot, resolved);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error('PATH_OUTSIDE_ROOT');
  }
  return resolved;
}

/**
 * Reject symlinks at every existing path component below a trusted project root.
 * The lexical jail in resolveInside is not sufficient when the filesystem can
 * redirect a safe-looking path to an unrelated file.
 */
export async function assertNoSymlinkPath(root, target) {
  const normalisedRoot = pathResolve(root);
  const resolvedTarget = pathResolve(target);
  const fromRoot = pathRelative(normalisedRoot, resolvedTarget);
  if (fromRoot === '..' || fromRoot.startsWith(`..${sep}`) || isAbsolute(fromRoot)) {
    throw new Error('PATH_OUTSIDE_ROOT');
  }

  const rootInfo = await lstat(normalisedRoot);
  if (rootInfo.isSymbolicLink()) throw new Error('SYMLINK_PATH_BLOCKED');
  if (!rootInfo.isDirectory()) throw new Error('PATH_NOT_DIRECTORY');

  if (!fromRoot) return;
  const parts = fromRoot.split(sep).filter(Boolean);
  let current = normalisedRoot;
  for (let index = 0; index < parts.length; index += 1) {
    current = join(current, parts[index]);
    let info;
    try {
      info = await lstat(current);
    } catch (error) {
      if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return;
      throw error;
    }
    if (info.isSymbolicLink()) throw new Error('SYMLINK_PATH_BLOCKED');
    if (index < parts.length - 1 && !info.isDirectory()) throw new Error('PATH_NOT_DIRECTORY');
  }
}

/** Human-readable relative path for the API (never leaks the absolute root). */
export function relativeInside(root, absolute) {
  const normalisedRoot = root.endsWith('/') ? root : `${root}/`;
  return absolute.startsWith(normalisedRoot) ? absolute.slice(normalisedRoot.length) : absolute;
}

/* -------------------------------------------------------------- kernel */

export function createSecurityKernel({ store, clock = () => new Date(), userId = 'local' } = {}) {
  if (!store) throw new Error('security kernel needs a store');

  const capability = (id) => {
    const found = CAPABILITY_BY_ID.get(id);
    if (!found) {
      const error = new Error(`UNKNOWN_CAPABILITY:${id}`);
      error.code = 'UNKNOWN_CAPABILITY';
      throw error;
    }
    return found;
  };

  const audit = (kind, { severity = 'info', subject = null, detail = {} } = {}) => {
    const event = {
      id: randomId('audit'),
      user_id: userId,
      kind,
      severity,
      subject,
      detail: JSON.stringify(detail),
      created_at: nowIso(clock),
    };
    store.run(
      'insert into audit_events (id, user_id, kind, severity, subject, detail, created_at) values (?, ?, ?, ?, ?, ?, ?)',
      [event.id, event.user_id, event.kind, event.severity, event.subject, event.detail, event.created_at],
    );
    return event;
  };

  const grants = () =>
    new Map(
      store
        .queryAll('select tool, granted from tool_permissions where user_id = ?', [userId])
        .map((row) => [row.tool, row.granted === 1]),
    );

  /** Grant or revoke a capability. `read` is granted by default at boot. */
  const setGrant = (capabilityId, granted) => {
    if (typeof granted !== 'boolean') {
      const error = new Error('A capability grant must be a boolean.');
      error.code = 'INVALID_GRANT';
      error.status = 400;
      throw error;
    }
    const found = capability(capabilityId);
    store.run(
      `insert into tool_permissions (id, user_id, tool, granted, level, updated_at)
       values (?, ?, ?, ?, ?, ?)
       on conflict (user_id, tool) do update set granted = excluded.granted, updated_at = excluded.updated_at`,
      [randomId('perm'), userId, found.id, granted ? 1 : 0, found.level, nowIso(clock)],
    );
    audit('permission.changed', {
      severity: found.level === 'read' ? 'info' : 'warning',
      subject: found.id,
      detail: { granted: Boolean(granted), level: found.level },
    });
    return listGrants();
  };

  const listGrants = () =>
    CAPABILITIES.map((entry) => ({
      ...entry,
      granted: grants().get(entry.id) ?? false,
      requiresApproval: APPROVAL_REQUIRED.has(entry.id),
    }));

  const ensureDefaults = () => {
    const existing = grants();
    // Reading and writing your own records on your own machine is the baseline.
    // Execution, network access and transmission are never implicit.
    const defaults = [
      'memory.read',
      'memory.write',
      'memory.delete',
      'tasks.read',
      'tasks.write',
      'tools.read',
      'skills.activate',
    ];
    for (const id of defaults) {
      if (existing.has(id)) continue;
      const found = capability(id);
      store.run(
        'insert into tool_permissions (id, user_id, tool, granted, level, updated_at) values (?, ?, ?, 1, ?, ?)',
        [randomId('perm'), userId, found.id, found.level, nowIso(clock)],
      );
    }
  };

  const isGranted = (capabilityId) => grants().get(capabilityId) === true;

  /** Check the latest approval, bound to the exact operation that requested it. */
  const isApprovalValid = (approvalId, approvalContext) => {
    if (
      typeof approvalId !== 'string' ||
      !approvalContext ||
      typeof approvalContext.subjectType !== 'string' ||
      typeof approvalContext.subjectId !== 'string'
    ) {
      return false;
    }
    const approval = getApproval(approvalId);
    if (!approval || approval.decision !== 'approved') return false;
    if (
      approval.subject_type !== approvalContext.subjectType ||
      approval.subject_id !== approvalContext.subjectId ||
      (Object.hasOwn(approvalContext, 'note') && approval.note !== approvalContext.note)
    ) {
      return false;
    }
    // A newer rejection/revocation for this operation invalidates any older
    // approved row, even if a caller still presents the old approval id.
    const latest = approvalFor(approvalContext.subjectType, approvalContext.subjectId);
    return latest?.id === approval.id && latest.decision === 'approved';
  };

  /** Throws unless granted (and, for risky capabilities, approved for this exact action). */
  const require = (capabilityId, { approvalId = null, approvalContext = null } = {}) => {
    const found = capability(capabilityId);
    if (!isGranted(capabilityId)) {
      const error = new Error(`PERMISSION_DENIED:${capabilityId}`);
      error.code = 'PERMISSION_DENIED';
      error.capability = found;
      throw error;
    }
    if (APPROVAL_REQUIRED.has(capabilityId) && !isApprovalValid(approvalId, approvalContext)) {
      const error = new Error(`APPROVAL_REQUIRED:${capabilityId}`);
      error.code = 'APPROVAL_REQUIRED';
      error.capability = found;
      throw error;
    }
    return true;
  };

  const requestApproval = ({ subjectType, subjectId, note = null }) => {
    const approval = {
      id: randomId('approval'),
      user_id: userId,
      subject_type: subjectType,
      subject_id: subjectId,
      decision: 'pending',
      note,
      created_at: nowIso(clock),
    };
    // `pending` is deliberately not a stored decision: the table only records a
    // decision the user actually made. A pending request is returned to the
    // caller and shown in the UI, and `decide()` writes the real row.
    audit('approval.requested', { subject: `${subjectType}:${subjectId}`, detail: { note } });
    return approval;
  };

  const decide = ({ subjectType, subjectId, decision, note = null }) => {
    if (!['approved', 'rejected', 'revoked'].includes(decision)) {
      const error = new Error('INVALID_DECISION');
      error.code = 'INVALID_DECISION';
      throw error;
    }
    const record = {
      id: randomId('approval'),
      user_id: userId,
      subject_type: subjectType,
      subject_id: subjectId,
      decision,
      note,
      created_at: nowIso(clock),
    };
    store.run(
      `insert into user_approvals (id, user_id, subject_type, subject_id, decision, note, created_at)
       values (?, ?, ?, ?, ?, ?, ?)`,
      [record.id, record.user_id, record.subject_type, record.subject_id, record.decision, record.note, record.created_at],
    );
    audit('approval.decided', {
      severity: decision === 'approved' ? 'info' : 'warning',
      subject: `${subjectType}:${subjectId}`,
      detail: { decision },
    });
    return record;
  };

  const getApproval = (id) =>
    store.queryOne('select * from user_approvals where id = ? and user_id = ?', [id, userId]) ?? null;

  /** The newest decision for a subject; `revoked` wins over an older approval. */
  const approvalFor = (subjectType, subjectId) =>
    store.queryOne(
      'select * from user_approvals where user_id = ? and subject_type = ? and subject_id = ? order by created_at desc, rowid desc limit 1',
      [userId, subjectType, subjectId],
    ) ?? null;

  const isApproved = (subjectType, subjectId) => approvalFor(subjectType, subjectId)?.decision === 'approved';

  const auditLog = ({ limit = 100 } = {}) =>
    store
      .queryAll(
        `select id, kind, severity, subject, detail, created_at from audit_events
         where user_id = ? order by created_at desc limit ?`,
        [userId, Math.min(Number(limit) || 100, 500)],
      )
      .map((row) => ({ ...row, detail: safeJson(row.detail) }));

  return {
    userId,
    listGrants,
    setGrant,
    isGranted,
    isApprovalValid,
    require,
    ensureDefaults,
    audit,
    auditLog,
    requestApproval,
    decide,
    getApproval,
    approvalFor,
    isApproved,
    capabilities: CAPABILITIES,
  };
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
