/**
 * Predictive Simulation Engine — dry runs, previews and reversible changes.
 *
 * Honest scope: this is a *file-change simulation*, not a physical or behavioural
 * model. It shows bounded diffs, can run allowlisted project tests in a temporary
 * copy, and can roll the change back with separate approval. Test scripts still
 * execute edited project code; execution is disabled by default and is not an OS
 * sandbox. The real project is never written without a changeset-bound approval.
 */
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cp, lstat, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { lstatSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, sep } from 'node:path';
import { LifeError } from './modelFabric.js';
import { assertNoSymlinkPath, resolveInside } from './security.js';
import { nowIso, randomId } from './store.js';

const MAX_FILES = 20;
const MAX_BYTES = 400_000;
const MAX_DIFF_LINES = 500;
const ALLOWED_SCRIPTS = new Set(['test:workspace', 'test:workspace-modules', 'test:nova-chat']);
const SENSITIVE_PATH = /(^|[\\/])(?:\.env(?:\.[^\\/]+)?|\.git|\.nova-life|node_modules|id_rsa|id_ed25519|[^\\/]+\.(?:pem|key)|credentials\.json|\.netrc)(?=$|[\\/])/i;

function simulationApplyApprovalContext(entries, currentContent) {
  const canonical = entries
    .map(({ path, next }) => ({ path, before: currentContent.get(path) ?? null, next }))
    .sort((left, right) => left.path.localeCompare(right.path));
  const digest = createHash('sha256').update(JSON.stringify(canonical)).digest('hex');
  return { subjectType: 'simulation', subjectId: `apply:${digest}`, note: 'simulation.apply' };
}

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
    const seen = new Set();
    let totalBytes = 0;
    return files.map((file) => {
      if (!file || typeof file !== 'object' || Array.isArray(file) || typeof file.path !== 'string' || typeof file.next !== 'string') {
        throw new LifeError('INVALID_CHANGESET', 'Each file change needs a path and string content.', { status: 400 });
      }
      const inputPath = file.path;
      if (!inputPath.trim() || inputPath.length > 1_024) {
        throw new LifeError('INVALID_PATH', 'Each simulation path must be a non-empty path under 1024 characters.', { status: 400 });
      }
      let absolute;
      try {
        absolute = resolveInside(root, inputPath);
      } catch (error) {
        const code = error?.message === 'PATH_INVALID' ? 'PATH_INVALID' : 'PATH_OUTSIDE_ROOT';
        throw new LifeError(code, `Refused: ${inputPath} is outside the project.`, { status: 403 });
      }
      const path = relative(root, absolute);
      const displayPath = path.split(sep).join('/');
      if (SENSITIVE_PATH.test(displayPath)) {
        throw new LifeError('SECRET_FILE_BLOCKED', 'Simulation cannot preview or change credential, engine-data or dependency paths.', { status: 403 });
      }
      if (seen.has(path)) {
        throw new LifeError('DUPLICATE_PATH', 'A changeset may mention each path only once.', { status: 400 });
      }
      seen.add(path);
      const nextBytes = Buffer.byteLength(file.next, 'utf8');
      totalBytes += nextBytes;
      if (nextBytes > MAX_BYTES || totalBytes > MAX_BYTES) {
        throw new LifeError('CHANGESET_TOO_LARGE', `Simulation content is limited to ${MAX_BYTES} UTF-8 bytes total.`, { status: 413 });
      }
      return { path, displayPath, absolute, next: file.next, nextBytes };
    });
  };

  const assertPathWithoutSymlinks = async (allowedRoot, path) => {
    try {
      await assertNoSymlinkPath(allowedRoot, path);
    } catch (error) {
      const code = error?.message === 'PATH_OUTSIDE_ROOT'
        ? 'PATH_OUTSIDE_ROOT'
        : error?.message === 'SYMLINK_PATH_BLOCKED'
          ? 'SYMLINK_PATH_BLOCKED'
          : 'PATH_INVALID';
      throw new LifeError(code, 'Simulation refuses paths that leave the workspace or traverse a symlink.', { status: 403 });
    }
  };
  const assertSafePath = (path) => assertPathWithoutSymlinks(root, path);

  /** Read-only: show the current content, the proposed content and a line diff. */
  const preview = async ({ files } = {}) => {
    const entries = normaliseFiles(files);
    const results = [];
    const currentContent = new Map();
    let inspectedBytes = entries.reduce((sum, entry) => sum + entry.nextBytes, 0);
    for (const entry of entries) {
      await assertSafePath(entry.absolute);
      let info = null;
      try {
        info = await lstat(entry.absolute);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      if (info && !info.isFile()) {
        throw new LifeError('NOT_A_FILE', `${entry.displayPath} is not a regular file.`, { status: 400 });
      }
      if (info?.size > MAX_BYTES) {
        throw new LifeError('FILE_TOO_LARGE', `${entry.displayPath} exceeds the preview read limit.`, { status: 413 });
      }
      if (info) inspectedBytes += info.size;
      if (inspectedBytes > MAX_BYTES * 2) {
        throw new LifeError('PREVIEW_TOO_LARGE', 'The current and proposed content exceed the preview budget.', { status: 413 });
      }
      const before = info ? await readFile(entry.absolute, 'utf8') : '';
      currentContent.set(entry.path, info ? before : null);
      const diff = lineDiff(before, entry.next);
      results.push({
        path: entry.displayPath,
        existed: Boolean(info),
        beforeBytes: info?.size ?? 0,
        afterBytes: entry.nextBytes,
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
      approvalContext: simulationApplyApprovalContext(entries, currentContent),
      note: 'Preview only. Nothing has been written.',
    };
  };

  /** Write the proposed files into an isolated temporary copy. */
  const createWorkspace = async ({ files, copyProject = false } = {}) => {
    const entries = normaliseFiles(files);
    const id = randomId('sim');
    const path = await mkdtemp(join(baseTmp, 'nova-life-sim-'));
    if (copyProject) {
      // Do not copy credentials, the engine's own database, dependencies or
      // symlinks into a workspace that may later execute project tests.
      await cp(root, path, {
        recursive: true,
        filter: (source) => {
          const relativeSource = relative(root, source);
          if (!relativeSource) return true;
          const portablePath = relativeSource.split(sep).join('/');
          if (SENSITIVE_PATH.test(portablePath) || /(^|\/)(?:dist|build|coverage|\.next|\.venv|__pycache__)(\/|$)/.test(portablePath)) return false;
          try {
            return !lstatSync(source).isSymbolicLink();
          } catch {
            return false;
          }
        },
      });
    }
    for (const entry of entries) {
      const target = join(path, entry.path);
      await assertPathWithoutSymlinks(path, target);
      await mkdirp(dirname(target));
      await assertPathWithoutSymlinks(path, target);
      await writeFile(target, entry.next, 'utf8');
    }
    workspaces.set(id, { id, path, files: entries.map((entry) => entry.path), createdAt: nowIso(clock), copied: copyProject });
    security.audit('simulation.workspace_created', { subject: id, detail: { files: entries.length, copied: copyProject } });
    return {
      id,
      path,
      files: workspaces.get(id).files,
      copied: copyProject,
      approvalContexts: [...ALLOWED_SCRIPTS].map((script) => ({
        subjectType: 'simulation',
        subjectId: id,
        note: `run:${script}`,
      })),
    };
  };

  const runTests = async ({ workspaceId, script = 'test:workspace', approvalId = null } = {}) => {
    const workspace = workspaces.get(workspaceId);
    if (!workspace) throw new LifeError('WORKSPACE_NOT_FOUND', 'No such simulation workspace.', { status: 404 });
    if (!executeEnabled) throw new LifeError('EXECUTION_DISABLED', 'Set NOVA_LIFE_ALLOW_EXECUTE=1 to run tests.', { status: 403 });
    if (!ALLOWED_SCRIPTS.has(script)) {
      throw new LifeError('SCRIPT_NOT_ALLOWED', `Only ${[...ALLOWED_SCRIPTS].join(', ')} may run.`, { status: 403 });
    }
    security.require('tools.execute', {
      approvalId,
      approvalContext: { subjectType: 'simulation', subjectId: workspace.id, note: `run:${script}` },
    });
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

  /** True when the project directory accepts writes (serverless mounts it read-only). */
  const projectWritable = async () => {
    const probe = join(root, '.nova-life', `.write-probe-${randomId('probe')}`);
    await assertSafePath(probe);
    try {
      await mkdirp(dirname(probe));
      await assertSafePath(probe);
      await writeFile(probe, '', { encoding: 'utf8', flag: 'wx' });
      await rm(probe, { force: true });
      return true;
    } catch (error) {
      if (error instanceof LifeError) throw error;
      await rm(probe, { force: true }).catch(() => {});
      return false;
    }
  };

  const assertUnchangedSinceApproval = async (item) => {
    await assertSafePath(item.entry.absolute);
    let info = null;
    try {
      info = await lstat(item.entry.absolute);
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
    }
    if (info && !info.isFile()) {
      throw new LifeError('NOT_A_FILE', `${item.entry.displayPath} is not a regular file.`, { status: 400 });
    }
    if (info?.size > MAX_BYTES) {
      throw new LifeError('STALE_PREVIEW', `${item.entry.displayPath} changed after its approved preview. Preview and approve it again.`, { status: 409 });
    }
    const current = info ? await readFile(item.entry.absolute, 'utf8') : null;
    if (current !== item.before) {
      throw new LifeError('STALE_PREVIEW', `${item.entry.displayPath} changed after its approved preview. Preview and approve it again.`, { status: 409 });
    }
  };

  /** Apply a change set to the real project. Requires an approval for this exact diff. */
  const apply = async ({ files, approvalId = null, tests = null } = {}) => {
    const entries = normaliseFiles(files);
    const prepared = [];
    const currentContent = new Map();

    // Bind approval to the current bytes as well as the proposed content, so a
    // stale preview cannot silently overwrite a newer file version.
    for (const entry of entries) {
      await assertSafePath(entry.absolute);
      let info = null;
      try {
        info = await lstat(entry.absolute);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      if (info && !info.isFile()) {
        throw new LifeError('NOT_A_FILE', `${entry.displayPath} is not a regular file.`, { status: 400 });
      }
      if (info?.size > MAX_BYTES) {
        throw new LifeError('FILE_TOO_LARGE', `${entry.displayPath} exceeds the apply read limit.`, { status: 413 });
      }
      const before = info ? await readFile(entry.absolute, 'utf8') : null;
      currentContent.set(entry.path, before);
      prepared.push({ entry, before, backup: null, existed: Boolean(info) });
    }

    const approvalContext = simulationApplyApprovalContext(entries, currentContent);
    security.require('simulation.apply', { approvalId, approvalContext });
    if (!(await projectWritable())) {
      throw new LifeError(
        'READ_ONLY_FILESYSTEM',
        'This deployment mounts the project read-only, so a simulated change cannot be applied here. Run the engine where the workspace is writable.',
        { status: 409 },
      );
    }

    for (const item of prepared) await assertUnchangedSinceApproval(item);

    const changeSetId = randomId('changeset');
    const backupDir = join(root, '.nova-life', 'backups', changeSetId);
    await assertSafePath(backupDir);
    await mkdirp(backupDir);
    await assertSafePath(backupDir);
    try {
      for (const item of prepared) {
        if (item.before === null) continue;
        item.backup = join(backupDir, item.entry.path);
        await assertPathWithoutSymlinks(root, item.backup);
        await mkdirp(dirname(item.backup));
        await assertPathWithoutSymlinks(root, item.backup);
        await writeFile(item.backup, item.before, { encoding: 'utf8', flag: 'wx' });
      }
    } catch (error) {
      await rm(backupDir, { recursive: true, force: true }).catch(() => {});
      throw new LifeError('BACKUP_FAILED', 'The changes could not be backed up safely; no project file was modified.', { status: 500, details: { cause: error?.code || 'IO_ERROR' } });
    }

    const applied = [];
    try {
      for (const item of prepared) {
        await assertUnchangedSinceApproval(item);
        await mkdirp(dirname(item.entry.absolute));
        await assertSafePath(item.entry.absolute);
        applied.push(item);
        await writeFile(item.entry.absolute, item.entry.next, 'utf8');
      }
    } catch (error) {
      let rollbackFailed = false;
      for (const item of applied.reverse()) {
        try {
          await assertSafePath(item.entry.absolute);
          if (item.existed) await writeFile(item.entry.absolute, item.before, 'utf8');
          else await rm(item.entry.absolute, { force: true });
        } catch {
          rollbackFailed = true;
          // Best-effort restoration; the original write error remains the cause.
        }
      }
      await rm(backupDir, { recursive: true, force: true }).catch(() => {});
      if (error instanceof LifeError && !rollbackFailed) throw error;
      throw new LifeError('APPLY_FAILED', 'The changeset could not be fully applied; completed writes were rolled back where possible.', { status: 500, details: { cause: error?.code || 'IO_ERROR' } });
    }

    const storedFiles = prepared.map(({ entry, backup, existed, before }) => ({
      path: entry.path,
      displayPath: entry.displayPath,
      existed,
      before,
      after: entry.next,
      backup,
    }));
    changeSets.set(changeSetId, { id: changeSetId, backupDir, files: storedFiles, appliedAt: nowIso(clock), tests });
    security.audit('simulation.applied', {
      severity: 'warning',
      subject: changeSetId,
      detail: { files: storedFiles.map((file) => file.displayPath), approvalId },
    });
    return {
      changeSetId,
      applied: storedFiles.map(({ displayPath, existed }) => ({ path: displayPath, existed })),
      rollbackApprovalContext: rollbackApprovalContext(changeSetId),
      tests,
    };
  };

  const rollbackApprovalContext = (changeSetId) => ({
    subjectType: 'simulation',
    subjectId: `rollback:${changeSetId}`,
    note: 'simulation.rollback',
  });

  const rollback = async (changeSetId, approvalId = null) => {
    const changeSet = changeSets.get(changeSetId);
    if (!changeSet) throw new LifeError('CHANGESET_NOT_FOUND', 'No such change set in this session.', { status: 404 });
    security.require('simulation.apply', { approvalId, approvalContext: rollbackApprovalContext(changeSetId) });

    // A rollback must not overwrite edits made after the approved apply. Verify
    // every current file and backup before the first restore begins.
    const prepared = [];
    for (const file of changeSet.files) {
      const absolute = resolveInside(root, file.path);
      await assertSafePath(absolute);
      let info = null;
      try {
        info = await lstat(absolute);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      if (!info?.isFile() || info.size > MAX_BYTES) {
        throw new LifeError('STALE_CHANGESET', `${file.displayPath} no longer matches the applied change.`, { status: 409 });
      }
      const current = await readFile(absolute, 'utf8');
      if (current !== file.after) {
        throw new LifeError('STALE_CHANGESET', `${file.displayPath} changed after apply; it was not overwritten.`, { status: 409 });
      }

      let before = null;
      if (file.existed) {
        if (!file.backup) throw new LifeError('BACKUP_NOT_FOUND', 'A required rollback backup is missing.', { status: 409 });
        await assertSafePath(file.backup);
        const backupInfo = await lstat(file.backup).catch((error) => {
          if (error?.code === 'ENOENT') return null;
          throw error;
        });
        if (!backupInfo?.isFile() || backupInfo.size > MAX_BYTES) {
          throw new LifeError('BACKUP_NOT_FOUND', 'A required rollback backup is missing or unsafe.', { status: 409 });
        }
        before = await readFile(file.backup, 'utf8');
        if (before !== file.before) {
          throw new LifeError('BACKUP_INVALID', 'A rollback backup no longer matches the approved change set.', { status: 409 });
        }
      }
      prepared.push({ file, absolute, before });
    }

    const restored = [];
    const changed = [];
    try {
      for (const item of prepared) {
        await assertSafePath(item.absolute);
        let info = null;
        try {
          info = await lstat(item.absolute);
        } catch (error) {
          if (error?.code !== 'ENOENT') throw error;
        }
        const current = info?.isFile() ? await readFile(item.absolute, 'utf8') : null;
        if (current !== item.file.after) {
          throw new LifeError('STALE_CHANGESET', `${item.file.displayPath} changed during rollback.`, { status: 409 });
        }
        changed.push(item);
        if (item.file.existed) {
          await writeFile(item.absolute, item.before, 'utf8');
          restored.push({ path: item.file.displayPath, restored: true });
        } else {
          await rm(item.absolute, { force: true });
          restored.push({ path: item.file.displayPath, removed: true });
        }
      }
    } catch (error) {
      let compensationFailed = false;
      for (const item of changed.reverse()) {
        try {
          await assertSafePath(item.absolute);
          let info = null;
          try {
            info = await lstat(item.absolute);
          } catch (lookupError) {
            if (lookupError?.code !== 'ENOENT') throw lookupError;
          }
          const current = info?.isFile() ? await readFile(item.absolute, 'utf8') : null;
          const rollbackValue = item.file.existed ? item.before : null;
          if (current === rollbackValue) {
            await writeFile(item.absolute, item.file.after, 'utf8');
          } else if (current !== item.file.after) {
            // Leave any concurrent, unrelated edit intact rather than clobber it.
            compensationFailed = true;
          }
        } catch {
          compensationFailed = true;
        }
      }
      if (error instanceof LifeError && !compensationFailed) throw error;
      throw new LifeError('ROLLBACK_FAILED', 'Rollback could not be completed; the original applied contents were restored where safe.', { status: 500, details: { cause: error?.code || 'IO_ERROR' } });
    }

    security.audit('simulation.rolled_back', { severity: 'warning', subject: changeSetId, detail: { restored: restored.length } });
    return { changeSetId, restored };
  };

  const list = () => ({
    workspaces: [...workspaces.values()].map((workspace) => ({
      id: workspace.id,
      files: workspace.files.map((path) => path.split(sep).join('/')),
      createdAt: workspace.createdAt,
      copied: workspace.copied,
    })),
    changeSets: [...changeSets.values()].map((changeSet) => ({
      id: changeSet.id,
      appliedAt: changeSet.appliedAt,
      files: changeSet.files.map((file) => file.displayPath),
      rollbackApprovalContext: rollbackApprovalContext(changeSet.id),
    })),
    executionEnabled: executeEnabled,
  });

  return { preview, createWorkspace, runTests, cleanup, apply, rollback, list, allowedScripts: [...ALLOWED_SCRIPTS] };
}

export function lineDiff(before, after) {
  const a = String(before ?? '').split('\n');
  const b = String(after ?? '').split('\n');
  const max = MAX_DIFF_LINES;
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
  if (a.length > max || b.length > max) lines.push(`# diff truncated at ${MAX_DIFF_LINES} lines`);
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
  maxDiffLines: MAX_DIFF_LINES,
  isolation: 'temporary directory copy (not an OS sandbox)',
  scripts: [...ALLOWED_SCRIPTS],
  note: 'Execution is disabled unless NOVA_LIFE_ALLOW_EXECUTE=1 and requires an approval bound to the workspace and script. A temporary directory is not a security boundary.',
};
