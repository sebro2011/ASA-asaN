/**
 * NOVA L.I.F.E. — HTTP surface.
 *
 * Starts the real Express router (with an in-memory database and a temporary
 * project root) and talks to it over HTTP, so status codes and error codes are
 * the ones a browser would actually receive.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-life-api.mjs
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import express from 'express';
import { createLifeEngine } from '../server/life/index.js';
import { createLifeAuthenticator, createLifeRouter } from '../server/life/router.js';

let root;
let engine;
let server;
let base;

before(async () => {
  root = mkdtempSync(join(tmpdir(), 'nova-life-api-'));
  mkdirSync(join(root, 'src'), { recursive: true });
  writeFileSync(join(root, 'src/app.ts'), 'export const ok = true;\n');
  engine = createLifeEngine({ inMemory: true, root, env: { NOVA_LOCAL_ONLY: '1' } });
  const app = express();
  app.use(express.json());
  const authEnv = {
    NODE_ENV: 'test',
    SUPABASE_URL: 'https://life-test.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_for_life_api',
    NOVA_LIFE_OWNER_ID: 'owner-1',
  };
  const authFetch = async (_url, init) => {
    const token = init.headers.authorization;
    if (token === 'Bearer test-owner-token') {
      return { ok: true, status: 200, json: async () => ({ id: 'owner-1' }) };
    }
    if (token === 'Bearer other-owner-token') {
      return { ok: true, status: 200, json: async () => ({ id: 'owner-2' }) };
    }
    return { ok: false, status: 401, json: async () => ({}) };
  };
  app.use('/api/nova/life', createLifeRouter({ engine, env: authEnv, fetchImpl: authFetch }));
  server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/nova/life`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  engine?.close();
  rmSync(root, { recursive: true, force: true });
});

async function call(path, options = {}) {
  const response = await fetch(`${base}${path}`, {
    ...options,
    headers: {
      'content-type': 'application/json',
      authorization: 'Bearer test-owner-token',
      ...(options.headers || {}),
    },
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
}

test('L.I.F.E. requires the configured owner session on every route', async () => {
  assert.equal((await call('/status', { headers: { authorization: '' } })).status, 401);
  const unauthenticated = await call('/security', { headers: { authorization: '' } });
  assert.equal(unauthenticated.body.code, 'LIFE_AUTH_REQUIRED');

  const otherOwner = await call('/status', { headers: { authorization: 'Bearer other-owner-token' } });
  assert.equal(otherOwner.status, 403);
  assert.equal(otherOwner.body.code, 'LIFE_OWNER_ONLY');

  const invalid = await call('/status', { headers: { authorization: 'Bearer invalid-owner-token' } });
  assert.equal(invalid.status, 401);
  assert.equal(invalid.body.code, 'LIFE_AUTH_INVALID');

  assert.equal((await call('/status')).status, 200);
});

test('unauthenticated local mode is explicit, development-only and loopback-only', async () => {
  const localAuth = createLifeAuthenticator({
    env: { NODE_ENV: 'development', NOVA_LIFE_ALLOW_UNAUTHENTICATED_LOCAL: '1' },
    fetchImpl: async () => { throw new Error('must not contact Supabase'); },
  });
  const local = await localAuth({ headers: {}, socket: { remoteAddress: '127.0.0.1' } });
  assert.equal(local.id, 'local');

  await assert.rejects(
    () => localAuth({ headers: {}, socket: { remoteAddress: '192.168.1.8' } }),
    (error) => error.code === 'LIFE_AUTH_REQUIRED',
  );

  const productionAuth = createLifeAuthenticator({
    env: { NODE_ENV: 'production', NOVA_LIFE_ALLOW_UNAUTHENTICATED_LOCAL: '1' },
  });
  await assert.rejects(
    () => productionAuth({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }),
    (error) => error.code === 'LIFE_AUTH_REQUIRED',
  );
});

test('status, config and security describe the running engine', async () => {
  const status = await call('/status');
  assert.equal(status.status, 200);
  assert.equal(status.body.name, 'NOVA NEXUS');
  assert.equal(status.body.mode.localOnly, true);
  assert.equal(status.body.storage.engine, 'sqlite');
  assert.equal(status.body.schemaVersion, 1);

  const config = await call('/config');
  assert.equal(config.body.localOnly, true);
  assert.equal(config.body.executionEnabled, false);
  assert.ok(Array.isArray(config.body.providers));
  assert.ok(config.body.providers.every((provider) => !('apiKey' in provider)));

  const security = await call('/security');
  assert.equal(security.status, 200);
  assert.ok(security.body.permissions.find((entry) => entry.id === 'memory.read').granted);
  assert.ok(security.body.permissions.find((entry) => entry.id === 'transmit.external').granted === false);
  assert.ok(Array.isArray(security.body.audit));
});

test('memory can be created, searched and deleted over HTTP', async () => {
  const created = await call('/memory', {
    method: 'POST',
    body: JSON.stringify({ category: 'semantic', title: 'Moon phases', body: 'Eight named phases in the synodic month.' }),
  });
  assert.equal(created.status, 200);
  const id = created.body.memory.id;

  const list = await call('/memory');
  assert.equal(list.body.counts.total, 1);
  assert.equal(list.body.memories[0].id, id);

  const search = await call('/memory/search?q=phases');
  assert.equal(search.body.strategy, 'fts');
  assert.equal(search.body.results[0].memory.id, id);

  const patched = await call(`/memory/${id}`, { method: 'PATCH', body: JSON.stringify({ body: 'Eight phases; the synodic month averages 29.53 days.' }) });
  assert.equal(patched.status, 200);
  assert.equal(patched.body.version, 2);

  const detail = await call(`/memory/${id}`);
  assert.equal(detail.body.versions.length, 1);
  const reverted = await call(`/memory/${id}/revert`, { method: 'POST', body: JSON.stringify({ version: 1 }) });
  assert.equal(reverted.status, 200);
  assert.equal(reverted.body.body, 'Eight named phases in the synodic month.');

  const removed = await call(`/memory/${id}`, { method: 'DELETE' });
  assert.equal(removed.body.deleted, true);
  assert.equal((await call(`/memory/${id}`)).status, 404);
});

test('errors carry a code and a status a client can act on', async () => {
  const secret = await call('/memory', {
    method: 'POST',
    body: JSON.stringify({ title: 'Key copy', body: 'sk-abcdef0123456789abcdef is my key' }),
  });
  assert.equal(secret.status, 422);
  assert.equal(secret.body.code, 'SECRET_IN_MEMORY');

  const invalid = await call('/memory', { method: 'POST', body: JSON.stringify({ title: 'x', body: 'y' }) });
  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.code, 'INVALID_MEMORY_TITLE');

  const malformedGrant = await call('/security/grants', {
    method: 'POST',
    body: JSON.stringify({ capability: 'transmit.external', granted: 'false' }),
  });
  assert.equal(malformedGrant.status, 400);
  assert.equal(malformedGrant.body.code, 'INVALID_GRANT');
  assert.equal((await call('/security')).body.permissions.find((entry) => entry.id === 'transmit.external').granted, false);
  const unknownGrant = await call('/security/grants', {
    method: 'POST',
    body: JSON.stringify({ capability: 'not-a-capability', granted: true }),
  });
  assert.equal(unknownGrant.status, 400);
  assert.equal(unknownGrant.body.code, 'UNKNOWN_PERMISSION');

  await call('/security/grants', { method: 'POST', body: JSON.stringify({ capability: 'memory.read', granted: false }) });
  const denied = await call('/memory');
  assert.equal(denied.status, 403);
  assert.equal(denied.body.code, 'PERMISSION_DENIED');
  assert.equal(denied.body.capability, 'memory.read');
  await call('/security/grants', { method: 'POST', body: JSON.stringify({ capability: 'memory.read', granted: true }) });

  const unknown = await call('/memory/does-not-exist');
  assert.equal(unknown.status, 404);
  assert.equal(unknown.body.code, 'MEMORY_NOT_FOUND');
});

test('a task runs through the API with real evidence', async () => {
  const created = await call('/tasks', {
    method: 'POST',
    body: JSON.stringify({ objective: 'Read src/app.ts and list the project', allowedTools: ['project.read', 'project.list'] }),
  });
  assert.equal(created.status, 200);
  const taskId = created.body.id;

  const run = await call(`/tasks/${taskId}/run`, { method: 'POST', body: JSON.stringify({}) });
  assert.equal(run.status, 200);
  assert.equal(run.body.task.status, 'completed');
  assert.equal(run.body.verification.status, 'verified');

  const verification = await call(`/tasks/${taskId}/verification`);
  assert.equal(verification.body.verifications[0].status, 'verified');
  const evidence = await call(`/evidence?taskId=${taskId}`);
  assert.ok(evidence.body.evidence.length >= 2);

  const experiences = await call('/experiences');
  assert.ok(experiences.body.experiences.some((entry) => entry.taskId === taskId && entry.replayable));
});

test('the skill lifecycle is enforced by the API, not just the UI', async () => {
  const created = await call('/skills', {
    method: 'POST',
    body: JSON.stringify({
      name: 'File inventory',
      description: 'List the project files and summarise the tree.',
      instructions: 'List the project and summarise what is there.',
      permissions: ['tools.read'],
      inputSchema: { type: 'object', required: ['objective'], properties: { objective: { type: 'string' } } },
      outputSchema: { type: 'object', required: ['summary'], properties: { summary: { type: 'string' } } },
      testCases: [{ name: 'basic', input: { objective: 'list' }, expect: { summary: 'tree listed' } }],
    }),
  });
  const id = created.body.skill.id;
  assert.equal((await call(`/skills/${id}/activate`, { method: 'POST' })).status, 403);

  const submitted = await call(`/skills/${id}/submit`, { method: 'POST' });
  assert.equal(submitted.body.skill?.status, 'sandbox_testing', JSON.stringify(submitted.body));
  const tested = await call(`/skills/${id}/test`, { method: 'POST' });
  assert.equal(tested.body.passed, true);
  assert.equal(tested.body.skill.status, 'verification');

  const approvalRequest = await call(`/skills/${id}/request-approval`, { method: 'POST' });
  assert.equal(approvalRequest.status, 200);
  const approval = await call('/security/approvals', {
    method: 'POST',
    body: JSON.stringify({
      ...approvalRequest.body.approvalContext,
      decision: 'approved',
      note: 'reviewed in test',
    }),
  });
  assert.equal(approval.status, 200);
  const activated = await call(`/skills/${id}/activate`, { method: 'POST' });
  assert.equal(activated.body.skill.status, 'active');
  assert.equal(activated.body.skill.currentVersion, 1);

  const rolledBack = await call(`/skills/${id}/rollback`, { method: 'POST', body: JSON.stringify({ version: 1 }) });
  assert.equal(rolledBack.body.skill.currentVersion, 1);
});

test('simulation refuses an unapproved apply and previews without writing', async () => {
  const preview = await call('/simulation/preview', {
    method: 'POST',
    body: JSON.stringify({ files: [{ path: 'src/app.ts', next: 'export const ok = false;\n' }] }),
  });
  assert.equal(preview.status, 200);
  assert.equal(preview.body.applied, false);
  assert.match(JSON.stringify(preview.body.files[0].diff), /ok = false/);

  const denied = await call('/simulation/apply', {
    method: 'POST',
    body: JSON.stringify({ files: [{ path: 'src/app.ts', next: 'export const ok = false;\n' }] }),
  });
  assert.equal(denied.status, 403);
  assert.ok(['PERMISSION_DENIED', 'APPROVAL_REQUIRED'].includes(denied.body.code));

  const traversal = await call('/simulation/preview', {
    method: 'POST',
    body: JSON.stringify({ files: [{ path: '../../etc/passwd', next: 'x' }] }),
  });
  assert.equal(traversal.status, 403);
  assert.equal(traversal.body.code, 'PATH_OUTSIDE_ROOT');
});

test('benchmarks and the graph are served from real records', async () => {
  const benchmarks = await call('/benchmarks');
  assert.ok(benchmarks.body.dataset.length >= 7);

  const run = await call('/benchmarks/run', { method: 'POST', body: JSON.stringify({}) });
  assert.equal(run.status, 200);
  assert.equal(run.body.passed, run.body.total);
  assert.ok(run.body.byLanguage.en);

  const graph = await call('/graph');
  assert.ok(graph.body.edges >= 1);

  const exported = await call('/export');
  assert.equal(exported.status, 200);
  assert.ok(Array.isArray(exported.body.data.memories));
});

test('provider health reports an unreachable local model honestly', async () => {
  const health = await call('/providers/health', { method: 'POST' });
  assert.equal(health.status, 200);
  const ollama = health.body.providers.find((provider) => provider.id === 'ollama');
  assert.equal(ollama.ok, false, 'no Ollama runs in the test sandbox');
  assert.ok(['error', 'unconfigured'].includes(ollama.status));
  const cloud = health.body.providers.filter((provider) => provider.kind === 'cloud');
  assert.ok(cloud.every((provider) => provider.status === 'blocked' || provider.status === 'unconfigured'));
  assert.equal(health.body.localAvailable, false);
});
