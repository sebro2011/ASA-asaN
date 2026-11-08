/**
 * SQLite-backed store for the L.I.F.E. engine.
 *
 * Design notes:
 *   - `node:sqlite` is built into Node 22, so the engine adds no dependency.
 *   - Every write goes through `tx()`, which is a real transaction with a
 *     rollback on throw — a half-written task or skill version cannot survive.
 *   - Migrations are recorded in `life_meta.schema_version` and applied in
 *     order; re-running them is a no-op.
 *   - `backup()` uses `VACUUM INTO`, which produces a consistent copy even
 *     while the database is open.
 *   - `deleteUser()` and `exportAll()` are the data-rights pair.
 */
import { mkdirSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { FTS_SQL, LATEST_SCHEMA_VERSION, MIGRATIONS } from './schema.js';

export function nowIso(clock = () => new Date()) {
  return clock().toISOString();
}

export function randomId(prefix = 'id') {
  const random = globalThis.crypto?.randomUUID?.();
  if (random) return `${prefix}_${random}`;
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Open (and migrate) the local database.
 *
 * @param {{ path?: string, backupDir?: string, clock?: () => Date, fts?: boolean }} options
 */
export function openLifeStore({
  path = ':memory:',
  backupDir = null,
  clock = () => new Date(),
  fts = true,
} = {}) {
  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  db.exec('pragma foreign_keys = on');
  if (path !== ':memory:') {
    // WAL keeps readers from blocking the single writer; it is not available
    // for in-memory databases.
    db.exec('pragma journal_mode = wal');
    db.exec('pragma synchronous = normal');
  }

  // `life_meta` must exist before the version is read, so bootstrap it outside
  // the migration loop. V1 declares it again with `if not exists`.
  db.exec('create table if not exists life_meta (key text primary key, value text not null)');

  const metaGet = (key) => {
    const row = db.prepare('select value from life_meta where key = ?').get(key);
    return row ? row.value : null;
  };
  const metaSet = (key, value) => {
    db.prepare('insert into life_meta (key, value) values (?, ?) on conflict (key) do update set value = excluded.value').run(
      key,
      String(value),
    );
  };

  let schemaVersion = Number(metaGet('schema_version') || 0);
  if (schemaVersion < LATEST_SCHEMA_VERSION) {
    db.exec('begin');
    try {
      for (const migration of MIGRATIONS) {
        if (migration.version <= schemaVersion) continue;
        db.exec(migration.sql);
        schemaVersion = migration.version;
      }
      metaSet('schema_version', schemaVersion);
      db.exec('commit');
    } catch (error) {
      db.exec('rollback');
      db.close();
      throw error;
    }
  }

  let hasFts = false;
  if (fts) {
    try {
      db.exec(FTS_SQL);
      // A virtual table that exists but cannot be queried is worse than none.
      db.prepare('select count(*) as count from memories_fts').get();
      hasFts = true;
    } catch {
      hasFts = false;
    }
  }

  const queryAll = (sql, params = []) => db.prepare(sql).all(...params);
  const queryOne = (sql, params = []) => db.prepare(sql).get(...params) ?? null;
  const run = (sql, params = []) => db.prepare(sql).run(...params);

  const tx = (fn) => {
    db.exec('begin immediate');
    try {
      const result = fn();
      db.exec('commit');
      return result;
    } catch (error) {
      try {
        db.exec('rollback');
      } catch {
        /* the transaction is already gone */
      }
      throw error;
    }
  };

  const backup = (destination = null) => {
    const target = destination ?? join(backupDir ?? dirname(path), `nova-life-${Date.now()}.sqlite`);
    mkdirSync(dirname(target), { recursive: true });
    db.exec(`vacuum into '${target.replace(/'/g, "''")}'`);
    return target;
  };

  const exportAll = (userId = 'local') => {
    const tables = [
      'memories',
      'memory_versions',
      'memory_links',
      'tasks',
      'task_steps',
      'experiences',
      'experience_evaluations',
      'skills',
      'skill_versions',
      'skill_runs',
      'verification_records',
      'evidence_records',
      'user_approvals',
      'audit_events',
      'tool_permissions',
      'benchmark_results',
    ];
    // Device permissions are configuration, not personal content: they are kept
    // when a user deletes their data (the audit trail of the deletion is not).
    const data = {};
    for (const table of tables) {
      const columns = queryAll(`pragma table_info(${table})`).map((column) => column.name);
      data[table] = columns.includes('user_id')
        ? queryAll(`select * from ${table} where user_id = ?`, [userId])
        : queryAll(`select * from ${table}`);
    }
    return { version: schemaVersion, exportedAt: nowIso(clock), userId, data };
  };

  const deleteUser = (userId) =>
    tx(() => {
      // Child rows go first: foreign keys are enforced, and a cascade that
      // silently drops history would hide the deletion in the audit log.
      const owned = queryAll('select id from tasks where user_id = ?', [userId]).map((row) => row.id);
      for (const taskId of owned) {
        run('delete from task_steps where task_id = ?', [taskId]);
        run('delete from verification_records where task_id = ?', [taskId]);
      }
      const skills = queryAll('select id from skills where user_id = ?', [userId]).map((row) => row.id);
      for (const skillId of skills) {
        run('delete from skill_runs where skill_id = ?', [skillId]);
        run('delete from skill_versions where skill_id = ?', [skillId]);
      }
      const experiences = queryAll('select id from experiences where user_id = ?', [userId]).map((row) => row.id);
      for (const experienceId of experiences) {
        run('delete from experience_evaluations where experience_id = ?', [experienceId]);
      }
      for (const table of [
        'memories',
        'memory_versions',
        'memory_links',
        'tasks',
        'experiences',
        'skills',
        'verification_records',
        'evidence_records',
        'user_approvals',
        'audit_events',
      ]) {
        const columns = queryAll(`pragma table_info(${table})`).map((column) => column.name);
        if (columns.includes('user_id')) run(`delete from ${table} where user_id = ?`, [userId]);
      }
      return { deleted: true, userId };
    });

  return {
    db,
    path,
    hasFts,
    get schemaVersion() {
      return Number(metaGet('schema_version') || 0);
    },
    metaGet,
    metaSet,
    queryAll,
    queryOne,
    run,
    tx,
    backup,
    exportAll,
    deleteUser,
    close: () => db.close(),
  };
}

/** Directory for the default local database, created on demand. */
function canCreate(dir) {
  try {
    mkdirSync(dir, { recursive: true });
    return true;
  } catch {
    return false;
  }
}

/**
 * Where the database lives when the operator does not choose.
 *
 * Serverless platforms mount the deployment read-only (`/var/task` on Vercel), so
 * a directory under the working directory cannot be created there. Rather than
 * failing every request with ENOENT, fall back to the OS temp directory — the
 * data is then *ephemeral* and the status endpoint says so. `NOVA_LIFE_DB` always
 * wins, so a deployment with persistent storage keeps it.
 */
export function defaultDbPath(env = process.env) {
  if (env.NOVA_LIFE_DB) return env.NOVA_LIFE_DB;
  const preferred = join(process.cwd(), '.nova-life', 'life.sqlite');
  if (canCreate(dirname(preferred))) return preferred;
  return join(tmpdir(), 'nova-life', 'life.sqlite');
}

/** True when a path lives in the OS temp directory, i.e. it will not survive a restart. */
export function isEphemeralPath(path) {
  if (!path || path === ':memory:') return path === ':memory:';
  const temp = tmpdir();
  return path === temp || path.startsWith(`${temp}/`);
}

/** True when the configured path already exists (used by the status endpoint). */
export function dbExists(path) {
  try {
    return existsSync(path);
  } catch {
    return false;
  }
}
