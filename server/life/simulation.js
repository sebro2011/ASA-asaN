/**
 * Predictive Simulation Engine — dry runs, previews and reversible changes.
 *
 * Honest scope: this is a *file-change simulation*, not a physical or behavioural
 * model. It shows exactly what would change, can run the project's own tests in
 * an isolated copy, and can roll the change back. It never executes arbitrary
 * shell commands and never writes to the project without a recorded approval.
 */
import { execFile } from 'node:child_process';
import { cp, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { LifeError } from './modelFabric.js';
import { resolveInside } from './security.js';
import { nowIso, randomId } from './store.js';

const MAX_FILES = 20;
const MAX_BYTES = 400_000;
const ALLOWED_SCRIPTS = new Set(['test:workspace', 'test:workspace-modules', 'test:nova-chat']);

export function createSimulationService({
  root,
  security,
  clock = () => new Date(),
  env = process.env,
  runCommand = defaultRunCommand,
  baseTmp = tmpdir(),
} = {}) {
  if (!root || !security) throw new Error('simulation service needs a project root and a security kernel');
  const executeEnabled = String(env.NOVA_LIFE_ALLOW_EXECUTE || '') === '1';
  const workspaces = new Map();
  const changeSets = new Map();

  const normaliseFiles = (files) => {
    if (!Array.isArray(files) || files.length === 0) {
      throw new LifeError('INVALID_CHANGESET', 'Provide at least one file change.', { status: 400 });
    }
    if (files.length > MAX_FILES) {
      throw new LifeError('CHANGESET_TOO_LARGE', `At most ${MAX_FILES} files per simulation.`, { status: 413 });
    }
    return files.map((file) => {
      const path = String(file?.path || '');
      let absolute;
      try {
        absolute = resolveInside(root, path);
      } catch {
        throw new LifeError('PATH_OUTSIDE_ROOT', `Refused: ${path} is outside the project.`, { status: 403 });
      }
      const next = typeof file.next === 'string' ? file.next : '';
      if (next.length > MAX_BYTES) throw new LifeError('FILE_TOO_LARGE', `${path} is larger than ${MAX_BYTES} bytes.`, { status: 413 });
      return { path: relative(root, absolute), absolute, next };
    });
  };

  /** Read-only: show the current content, the proposed content and a line diff. */
  const preview = async ({ files } = {}) => {
    const entries = normaliseFiles(files);
    const results = [];
    for (const entry of entries) {
      const before = await readFile(entry.absolute, 'utf8').catch(() => '');
      const diff = lineDiff(before, entry.next);
      results.push({
        path: entry.path,
        existed: before.length > 0,
        beforeBytes: Buffer.byteLength(before),
        afterBytes: Buffer.byteLength(entry.next),
        added: diff.added,
        removed: diff.removed,
        diff: diff.lines,
      });
    }
    return {
      dryRun: true,
      applied: false,
      files: results,
      totals: results.reduce(
        (sum, file) => ({ added: sum.added + file.added, removed: sum.removed + file.removed }),
        { added: 0, removed: 0 },
      ),
      note: 'Preview only. Nothing has been written.',
    };
  };

  /** Write the proposed files into an isolated temporary copy. */
  const createWorkspace = async ({ files, copyProject = false } = {}) => {
    const entries = normaliseFiles(files);
    const id = randomId('sim');
    const path = await mkdtemp(join(baseTmp, 'nova-life-sim-'));
    if (copyProject) {
      // A working copy lets tests run against real imports; node_modules are not
      // copied (too large) — the scripts run from the project instead.
      await cp(root, path, {
        recursive: true,
        filter: (source) => !/node_modules|\.git|dist|build|coverage/.test(source),
      });
    }
    for (const entry of entries) {
      const target = join(path, entry.path);
      await writeFile(target, entry.next, 'utf8');
    }
    workspaces.set(id, { id, path, files: entries.map((entry) => entry.path), createdAt: nowIso(clock), copied: copyProject });
    security.audit('simulation.workspace_created', { subject: id, detail: { files: entries.length, copied: copyProject } });
    return { id, path, files: workspaces.get(id).files, copied: copyProject };
  };

  const runTests = async ({ workspaceId, script = 'test:workspace', approvalId = null } = {}) => {
    const workspace = workspaces.get(workspaceId);
    if (!workspace) throw new LifeError('WORKSPACE_NOT_FOUND', 'No such simulation workspace.', { status: 404 });
    if (!executeEnabled) throw new LifeError('EXECUTION_DISABLED', 'Set NOVA_LIFE_ALLOW_EXECUTE=1 to run tests.', { status: 403 });
    if (!ALLOWED_SCRIPTS.has(script)) {
      throw new LifeError('SCRIPT_NOT_ALLOWED', `Only ${[...ALLOWED_SCRIPTS].join(', ')} may run.`, { status: 403 });
    }
    security.require('tools.execute', { approvalId });
    const started = Date.now();
    const result = await runCommand({ root: workspace.path, script, timeoutMs: 180_000 });
    return {
      workspaceId,
      script,
      exitCode: result.exitCode,
      passed: result.exitCode === 0,
      durationMs: Date.now() - started,
      output: `${result.stdout}\n${result.stderr}`.slice(0, 8000),
    };
  };

  const cleanup = async (workspaceId) => {
    const workspace = workspaces.get(workspaceId);
    if (!workspace) return { removed: false };
    await rm(workspace.path, { recursive: true, force: true });
    workspaces.delete(workspaceId);
    return { removed: true };
  };

  /** Apply a change set to the real project. Requires an approval record. */
  const apply = async ({ files, approvalId = null, tests = null } = {}) => {
    const entries = normaliseFiles(files);
    security.require('simulation.apply', { approvalId });
    const changeSetId = randomId('changeset');
    const backupDir = join(root, '.nova-life', 'backups', changeSetId);
    const applied = [];
    for (const entry of entries) {
      const existed = existsSync(entry.absolute);
      const before = existed ? await readFile(entry.absolute, 'utf8') : null;
      if (before !== null) {
        const backupPath = join(backupDir, entry.path);
        await mkdirp(dirname(backupPath));
        await writeFile(backupPath, before, 'utf8');
      }
      await mkdirp(dirname(entry.absolute));
      await writeFile(entry.absolute, entry.next, 'utf8');
      applied.push({ path: entry.path, existed, backup: before === null ? null : join(backupDir, entry.path) });
    }
    changeSets.set(changeSetId, { id: changeSetId, backupDir, files: applied, appliedAt: nowIso(clock), tests });
    security.audit('simulation.applied', {
      severity: 'warning',
      subject: changeSetId,
      detail: { files: applied.map((file) => file.path), approvalId },
    });
    return { changeSetId, applied, backupDir, tests };
  };

  const rollback = async (changeSetId) => {
    const changeSet = changeSets.get(changeSetId);
    if (!changeSet) throw new LifeError('CHANGESET_NOT_FOUND', 'No such change set in this session.', { status: 404 });
    const restored = [];
    for (const file of changeSet.files) {
      const absolute = join(root, file.path);
      if (file.backup && existsSync(file.backup)) {
        const before = await readFile(file.backup, 'utf8');
        await writeFile(absolute, before, 'utf8');
        restored.push({ path: file.path, restored: true });
      } else if (!file.existed) {
        await rm(absolute, { force: true });
        restored.push({ path: file.path, removed: true });
      }
    }
    security.audit('simulation.rolled_back', { severity: 'warning', subject: changeSetId, detail: { restored: restored.length } });
    return { changeSetId, restored };
  };

  const list = () => ({
    workspaces: [...workspaces.values()],
    changeSets: [...changeSets.values()].map((changeSet) => ({
      id: changeSet.id,
      appliedAt: changeSet.appliedAt,
      files: changeSet.files.map((file) => file.path),
    })),
    executionEnabled: executeEnabled,
  });

  return { preview, createWorkspace, runTests, cleanup, apply, rollback, list, allowedScripts: [...ALLOWED_SCRIPTS] };
}

export function lineDiff(before, after) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  const max = 2000;
  const left = a.slice(0, max);
  const right = b.slice(0, max);
  // Longest common subsequence, capped: files are small and this is preview-only.
  const table = Array.from({ length: left.length + 1 }, () => new Uint16Array(right.length + 1));
  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      table[i][j] = left[i] === right[j] ? table[i + 1][j + 1] + 1 : Math.max(table[i + 1][j], table[i][j + 1]);
    }
  }
  const lines = [];
  let added = 0;
  let removed = 0;
  let i = 0;
  let j = 0;
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      lines.push(` ${left[i]}`);
      i += 1;
      j += 1;
    } else if (table[i + 1][j] >= table[i][j + 1]) {
      lines.push(`-${left[i]}`);
      removed += 1;
      i += 1;
    } else {
      lines.push(`+${right[j]}`);
      added += 1;
      j += 1;
    }
  }
  while (i < left.length) {
    lines.push(`-${left[i]}`);
    removed += 1;
    i += 1;
  }
  while (j < right.length) {
    lines.push(`+${right[j]}`);
    added += 1;
    j += 1;
  }
  if (a.length > max || b.length > max) lines.push('# diff truncated at 2000 lines');
  return { lines, added, removed };
}

async function mkdirp(dir) {
  const { mkdir } = await import('node:fs/promises');
  await mkdir(dir, { recursive: true });
}

async function defaultRunCommand({ root, script, timeoutMs }) {
  return new Promise((resolve) => {
    execFile(
      process.platform === 'win32' ? 'npm.cmd' : 'npm',
      ['run', '--silent', script],
      {
        cwd: root,
        timeout: timeoutMs,
        maxBuffer: 4 * 1024 * 1024,
        env: { PATH: process.env.PATH || '', HOME: process.env.HOME || '', NODE_ENV: 'test', CI: '1' },
      },
      (error, stdout, stderr) => {
        resolve({ exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
      },
    );
  });
}

/** Exported for the status endpoint: a simulation is not a security sandbox. */
export const SIMULATION_LIMITS = {
  maxFiles: MAX_FILES,
  maxBytes: MAX_BYTES,
  isolation: 'temporary directory copy (not an OS sandbox)',
  scripts: [...ALLOWED_SCRIPTS],
  note: 'A temporary directory is not a security boundary. Execution is disabled unless NOVA_LIFE_ALLOW_EXECUTE=1 and requires an approval.',
};
