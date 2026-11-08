/**
 * Tool registry — the only way the engine touches anything outside its database.
 *
 * Every tool declares a permission level, a schema and a hard limit. The
 * orchestrator can only call tools that appear in both the registry and the
 * task's allowlist, and risky tools additionally need a recorded approval.
 *
 * There is no shell tool. `tests.run` is the only execution path, it runs a
 * fixed allowlist of npm scripts through `execFile` (never a shell), and it is
 * disabled unless the operator sets NOVA_LIFE_ALLOW_EXECUTE=1.
 */
import { execFile } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { LifeError } from './modelFabric.js';
import { resolveInside, sanitizeUntrusted } from './security.js';

const MAX_READ_BYTES = 200_000;
const MAX_LIST = 400;
const MAX_OUTPUT = 8_000;
const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', '.next', '.venv', '__pycache__']);

/** npm scripts the engine may run, and nothing else. */
const ALLOWED_TEST_SCRIPTS = new Set([
  'test',
  'test:workspace',
  'test:workspace-modules',
  'test:workspace-astronomy',
  'test:nova-chat',
]);

const SECRET_FILE = /(^|\/)(\.env(\..*)?|\.git\/|id_rsa|id_ed25519|.*\.pem|.*\.key|credentials\.json|\.netrc)$/i;

const ALLOWED_FETCH_HOSTS = new Set(['api.github.com', 'export.arxiv.org', 'api.spaceflightnewsapi.net']);

export function createToolRegistry({
  root,
  security,
  clock = () => new Date(),
  env = process.env,
  fetchImpl = (...args) => fetch(...args),
  runCommand = defaultRunCommand,
} = {}) {
  if (!root || !security) throw new Error('tool registry needs a project root and a security kernel');
  const executeEnabled = String(env.NOVA_LIFE_ALLOW_EXECUTE || '') === '1';

  const tools = new Map();

  const register = (tool) => {
    tools.set(tool.id, tool);
    return tool;
  };

  const withinRoot = (candidate) => {
    try {
      return resolveInside(root, candidate);
    } catch (error) {
      throw new LifeError(
        error.message === 'PATH_OUTSIDE_ROOT' ? 'PATH_OUTSIDE_ROOT' : 'PATH_INVALID',
        'That path is outside the project directory.',
        { status: 403 },
      );
    }
  };

  register({
    id: 'project.list',
    level: 'read',
    description: 'List files in the project (node_modules, .git and build output excluded).',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } } },
    async run({ path: subPath = '' } = {}) {
      const start = withinRoot(subPath || '.');
      const files = [];
      const walk = async (dir, depth) => {
        if (files.length >= MAX_LIST || depth > 6) return;
        let entries;
        try {
          entries = await readdir(dir, { withFileTypes: true });
        } catch {
          return;
        }
        for (const entry of entries) {
          if (files.length >= MAX_LIST) return;
          if (entry.name.startsWith('.') && entry.name !== '.env.example') continue;
          if (IGNORED_DIRS.has(entry.name)) continue;
          const absolute = join(dir, entry.name);
          if (entry.isDirectory()) await walk(absolute, depth + 1);
          else files.push(relative(root, absolute));
        }
      };
      await walk(start, 0);
      return { files: files.sort(), truncated: files.length >= MAX_LIST };
    },
  });

  register({
    id: 'project.read',
    level: 'read',
    description: 'Read one text file from the project. Credential files are refused.',
    inputSchema: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] },
    async run({ path: filePath } = {}) {
      if (!filePath) throw new LifeError('INVALID_INPUT', 'A file path is required.', { status: 400 });
      if (SECRET_FILE.test(String(filePath))) {
        throw new LifeError('SECRET_FILE_BLOCKED', 'Credential and key files are never readable by the engine.', { status: 403 });
      }
      const absolute = withinRoot(filePath);
      const info = await stat(absolute).catch(() => null);
      if (!info || !info.isFile()) throw new LifeError('FILE_NOT_FOUND', 'No such file.', { status: 404 });
      if (info.size > MAX_READ_BYTES) {
        throw new LifeError('FILE_TOO_LARGE', `Files larger than ${MAX_READ_BYTES} bytes are not read.`, { status: 413 });
      }
      const content = await readFile(absolute, 'utf8');
      const clean = sanitizeUntrusted(content, { maxChars: MAX_READ_BYTES });
      return {
        path: relative(root, absolute),
        bytes: info.size,
        content: clean.text,
        redacted: clean.redacted,
        suspicious: clean.signals,
        truncated: clean.truncated,
      };
    },
  });

  register({
    id: 'project.search',
    level: 'read',
    description: 'Search project text files for a literal string.',
    inputSchema: {
      type: 'object',
      properties: { query: { type: 'string' }, limit: { type: 'number' } },
      required: ['query'],
    },
    async run({ query, limit = 20 } = {}) {
      const needle = String(query || '').trim();
      if (needle.length < 2) throw new LifeError('INVALID_INPUT', 'Search for at least two characters.', { status: 400 });
      const { files } = await tools.get('project.list').run({});
      const hits = [];
      for (const file of files) {
        if (hits.length >= Math.min(Number(limit) || 20, 50)) break;
        if (!/\.(ts|tsx|js|jsx|mjs|cjs|json|md|css|sql|yml|yaml)$/.test(file)) continue;
        let content;
        try {
          content = await readFile(join(root, file), 'utf8');
        } catch {
          continue;
        }
        const index = content.toLowerCase().indexOf(needle.toLowerCase());
        if (index < 0) continue;
        const line = content.slice(0, index).split('\n').length;
        hits.push({ path: file, line, excerpt: content.slice(Math.max(0, index - 80), index + 160).replace(/\s+/g, ' ') });
      }
      return { query: needle, hits, scanned: files.length };
    },
  });

  register({
    id: 'tests.run',
    level: 'execute',
    description: 'Run one allowlisted npm test script and return its real exit code and output.',
    inputSchema: {
      type: 'object',
      properties: { script: { type: 'string' } },
      required: ['script'],
    },
    enabled: () => executeEnabled,
    async run({ script } = {}, { approvalId = null } = {}) {
      if (!executeEnabled) {
        throw new LifeError('EXECUTION_DISABLED', 'Code execution is disabled. Set NOVA_LIFE_ALLOW_EXECUTE=1 to enable it.', {
          status: 403,
        });
      }
      if (!ALLOWED_TEST_SCRIPTS.has(script)) {
        throw new LifeError('SCRIPT_NOT_ALLOWED', `Only these scripts may run: ${[...ALLOWED_TEST_SCRIPTS].join(', ')}`, {
          status: 403,
        });
      }
      security.require('tools.execute', { approvalId });
      const started = Date.now();
      const result = await runCommand({ root, script, timeoutMs: 180_000 });
      const output = sanitizeUntrusted(`${result.stdout}\n${result.stderr}`.trim(), { maxChars: MAX_OUTPUT });
      return {
        script,
        exitCode: result.exitCode,
        durationMs: Date.now() - started,
        output: output.text,
        redacted: output.redacted,
        truncated: output.truncated || (result.stdout?.length ?? 0) + (result.stderr?.length ?? 0) > MAX_OUTPUT,
        passed: result.exitCode === 0,
      };
    },
  });

  register({
    id: 'web.fetch',
    level: 'network',
    description: 'Fetch an allowlisted HTTPS URL. Off by default; needs network permission and approval.',
    inputSchema: { type: 'object', properties: { url: { type: 'string' } }, required: ['url'] },
    async run({ url } = {}, { approvalId = null } = {}) {
      security.require('network.fetch', { approvalId });
      let parsed;
      try {
        parsed = new URL(String(url));
      } catch {
        throw new LifeError('INVALID_URL', 'That is not a valid URL.', { status: 400 });
      }
      if (parsed.protocol !== 'https:' || !ALLOWED_FETCH_HOSTS.has(parsed.hostname)) {
        throw new LifeError('HOST_NOT_ALLOWED', `Only allowlisted HTTPS hosts may be fetched: ${[...ALLOWED_FETCH_HOSTS].join(', ')}`, {
          status: 403,
        });
      }
      const response = await fetchImpl(parsed.toString(), {
        headers: { 'user-agent': 'NOVA-NEXUS/1.0 (local research assistant)' },
      });
      const text = await response.text();
      const clean = sanitizeUntrusted(text, { maxChars: 20_000 });
      return { url: parsed.toString(), status: response.status, body: clean.text, suspicious: clean.signals };
    },
  });

  const list = () =>
    [...tools.values()].map((tool) => ({
      id: tool.id,
      level: tool.level,
      description: tool.description,
      inputSchema: tool.inputSchema,
      granted: security.isGranted(tool.level === 'network' ? 'network.fetch' : tool.level === 'execute' ? 'tools.execute' : 'tools.read'),
      enabled: tool.enabled ? tool.enabled() : true,
      requiresApproval: tool.level === 'execute' || tool.level === 'network',
    }));

  const get = (id) => {
    const tool = tools.get(id);
    if (!tool) throw new LifeError('UNKNOWN_TOOL', `No such tool: ${id}`, { status: 400 });
    return tool;
  };

  const invoke = async (id, input = {}, context = {}) => {
    const tool = get(id);
    if (tool.enabled && !tool.enabled()) {
      throw new LifeError('TOOL_DISABLED', `${id} is disabled on this deployment.`, { status: 403 });
    }
    if (tool.level === 'read') security.require('tools.read');
    const result = await tool.run(input, context);
    security.audit('tool.used', { subject: id, detail: { level: tool.level, keys: Object.keys(input) } });
    return result;
  };

  return { root, list, get, invoke, allowlistedScripts: [...ALLOWED_TEST_SCRIPTS] };
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
        // A scrubbed environment: no tokens, no keys, nothing to leak.
        env: {
          PATH: process.env.PATH || '',
          HOME: process.env.HOME || '',
          NODE_ENV: 'test',
          CI: '1',
        },
      },
      (error, stdout, stderr) => {
        resolve({ exitCode: error ? (typeof error.code === 'number' ? error.code : 1) : 0, stdout: String(stdout || ''), stderr: String(stderr || '') });
      },
    );
  });
}

export const ALLOWED_TOOL_IDS = ['project.list', 'project.read', 'project.search', 'tests.run', 'web.fetch'];
