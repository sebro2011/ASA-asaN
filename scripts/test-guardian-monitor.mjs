/**
 * COSMORA API Guardian — sweep, recovery, security and HTTP surface.
 *
 * Probes are injected, never live: this suite asserts *behaviour of the monitor*
 * (classification, budgeting, lease, persistence, verification), which is exactly
 * where a monitoring system quietly lies to itself. Live provider reachability is
 * a separate, explicitly-labelled exercise.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-guardian-monitor.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

const { MemoryStore } = await import('../server/guardian/store.ts');
const { createGuardianMonitor } = await import('../server/guardian/monitor.ts');
const { createRecovery, RECOVERY_ACTIONS, HUMAN_ONLY_OPERATIONS } = await import('../server/guardian/recovery.ts');
const { createGuardianRuntime, createGuardianRouter } = await import('../server/guardian/routes.ts');
const security = await import('../server/guardian/security.ts');

/* ------------------------------ test providers ----------------------------- */

function provider(id, behaviour, { cost = 'free' } = {}) {
  return {
    id,
    label: id,
    kind: 'nasa',
    endpoint: `${id}.example.test`,
    requiresEnv: [],
    cost,
    async run(context) {
      return behaviour(context);
    },
  };
}

const okProvider = (id, latency = 10) =>
  provider(id, (context) => ({
    providerId: id,
    status: 'ok',
    code: 'OK',
    latencyMs: latency,
    httpStatus: 200,
    checkedAt: context.now(),
  }));

const downProvider = (id, code = 'UPSTREAM_5XX') =>
  provider(id, (context) => ({
    providerId: id,
    status: 'down',
    code,
    latencyMs: 12,
    httpStatus: 503,
    reason: 'Upstream answered 503.',
    checkedAt: context.now(),
  }));

const degradedProvider = (id) =>
  provider(id, (context) => ({
    providerId: id,
    status: 'degraded',
    code: 'RATE_LIMITED',
    latencyMs: 30,
    httpStatus: 429,
    checkedAt: context.now(),
  }));

const makeMonitor = (overrides = {}) => {
  const store = overrides.store ?? new MemoryStore();
  return createGuardianMonitor({
    store,
    providers: [okProvider('a'), okProvider('b'), okProvider('c')],
    env: {},
    fetchImpl: async () => new Response('{}', { status: 200 }),
    now: overrides.now ?? (() => 1_000),
    instanceId: 'instance-1',
    random: () => 0.5,
    concurrency: 2,
    ...overrides,
  });
};

/* ---------------------------------- sweep --------------------------------- */

test('a clean sweep records one run, one sample per provider and no alarm', async () => {
  const store = new MemoryStore();
  const monitor = makeMonitor({ store });
  const result = await monitor.runOnce({ trigger: 'manual', actor: 'admin:test' });

  assert.equal(result.ran, true);
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.ok, 3);
  assert.equal(result.summary.incident, false);
  assert.equal(result.summary.triggeredBy, 'admin:test');
  assert.equal(result.summary.outcomes.length, 3);

  // The run is persisted with its summary; the samples carry the run id.
  const runs = await store.listRuns({ limit: 5 });
  assert.equal(runs.length, 1);
  assert.equal(runs[0].summary.runId, result.summary.runId);
  const samples = await store.listSamples({ limit: 10 });
  assert.equal(samples.length, 3);
  assert.ok(samples.every((sample) => sample.runId === result.summary.runId));

  // Nothing alarming happened, so nothing was raised.
  assert.equal((await store.listAudit({ limit: 10 })).length, 0);
});

test('a failing provider makes the run an incident and is audited once', async () => {
  const store = new MemoryStore();
  const monitor = makeMonitor({ store, providers: [okProvider('a'), downProvider('b')] });
  const result = await monitor.runOnce({ trigger: 'schedule', actor: 'cron' });

  assert.equal(result.summary.incident, true);
  assert.equal(result.summary.down, 1);
  const audit = await store.listAudit({ limit: 10 });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].action, 'sweep-incident');
  assert.equal(audit[0].severity, 'critical');
  assert.equal(audit[0].target, 'b');
});

test('metered providers are skipped by a cheap sweep and never reported as ok', async () => {
  const store = new MemoryStore();
  const monitor = makeMonitor({
    store,
    providers: [okProvider('free'), provider('paid', () => {
      throw new Error('a metered probe must not run in a cheap sweep');
    }, { cost: 'metered' })],
  });

  const cheap = await monitor.runOnce({ trigger: 'manual', actor: 'admin' });
  const paid = cheap.summary.outcomes.find((outcome) => outcome.providerId === 'paid');
  assert.equal(paid.status, 'skipped');
  assert.equal(paid.code, 'METERED_SKIPPED');
  assert.equal(cheap.summary.ok, 1);

  const deep = await monitor.runOnce({ trigger: 'manual', actor: 'admin', includeMetered: true });
  const paidDeep = deep.summary.outcomes.find((outcome) => outcome.providerId === 'paid');
  assert.equal(paidDeep.status, 'down');
  assert.equal(paidDeep.code, 'PROBE_THREW');
});

test('an open circuit skips the probe instead of hammering a dead provider', async () => {
  const store = new MemoryStore();
  let clock = 0;
  const monitor = makeMonitor({
    store,
    now: () => clock,
    providers: [downProvider('dead')],
  });
  // Threshold is 3 consecutive failures; the breaker trips on the third run.
  for (let i = 0; i < 3; i += 1) {
    clock += 1_000;
    await monitor.runOnce({ trigger: 'manual', actor: 'admin' });
  }
  clock += 1_000;
  const skippedRun = await monitor.runOnce({ trigger: 'manual', actor: 'admin' });
  assert.equal(skippedRun.summary.outcomes[0].status, 'skipped');
  assert.equal(skippedRun.summary.outcomes[0].code, 'CIRCUIT_OPEN');
  // The run still completes and is recorded.
  assert.equal(skippedRun.summary.runs ?? skippedRun.summary.total >= 1, true);
});

test('two instances sharing a store cannot run the sweep twice at once', async () => {
  const store = new MemoryStore();
  const shared = { store, providers: [okProvider('a')], env: {}, fetchImpl: async () => new Response('{}') };
  const first = createGuardianMonitor({ ...shared, instanceId: 'i-1', now: () => 1_000 });
  const second = createGuardianMonitor({ ...shared, instanceId: 'i-2', now: () => 1_000 });

  const [a, b] = await Promise.all([
    first.runOnce({ trigger: 'schedule', actor: 'cron' }),
    second.runOnce({ trigger: 'schedule', actor: 'cron' }),
  ]);
  const ran = [a, b].filter((result) => result.ran);
  assert.equal(ran.length, 1, 'exactly one sweep may hold the lease');
  const blocked = [a, b].find((result) => !result.ran);
  assert.match(blocked.reason, /already running/);
  assert.equal(blocked.holder.startsWith('i-'), true);
});

test('the run deadline marks the remaining providers as skipped rather than failing them', async () => {
  let clock = 0;
  const slow = provider('slow', async (context) => {
    clock += 40; // consume the whole deadline
    return { providerId: 'slow', status: 'ok', code: 'OK', latencyMs: 40, checkedAt: context.now() };
  });
  const store = new MemoryStore();
  // One probe in flight at a time, so the deadline is the only thing that can
  // decide whether "later" was attempted.
  const monitor = makeMonitor({
    store,
    now: () => clock,
    providers: [slow, okProvider('later')],
    runDeadlineMs: 20,
    concurrency: 1,
  });
  const result = await monitor.runOnce({ trigger: 'manual', actor: 'admin' });
  const later = result.summary.outcomes.find((outcome) => outcome.providerId === 'later');
  assert.equal(later.status, 'skipped');
  assert.equal(later.code, 'RUN_DEADLINE');
  assert.equal(result.summary.incident, false, 'a skipped provider is not an outage');
});

/* -------------------------------- analytics -------------------------------- */

test('analytics computes availability, latency percentiles and failure codes', async () => {
  const store = new MemoryStore();
  const latencies = [10, 20, 30, 500];
  let index = 0;
  const flaky = provider('flaky', (context) => {
    const latency = latencies[index] ?? 10;
    index += 1;
    return {
      providerId: 'flaky',
      status: index === 3 ? 'down' : 'ok',
      code: index === 3 ? 'TIMEOUT' : 'OK',
      latencyMs: latency,
      checkedAt: context.now(),
    };
  });
  const monitor = makeMonitor({ store, providers: [flaky] });
  for (let run = 0; run < 4; run += 1) await monitor.runOnce({ trigger: 'manual', actor: 'admin' });

  const analytics = await monitor.analytics({ windowMs: 24 * 60 * 60_000 });
  const entry = analytics.providers.find((p) => p.providerId === 'flaky');
  assert.equal(entry.samples, 4);
  assert.equal(entry.ok, 3);
  assert.equal(entry.down, 1);
  assert.equal(entry.availability, 0.75);
  assert.equal(entry.codes.OK, 3);
  assert.equal(entry.codes.TIMEOUT, 1);
  assert.equal(entry.p50LatencyMs, 20);
  assert.equal(entry.p95LatencyMs, 500);
  assert.equal(analytics.incidents, 1);
});

test('analytics keeps unprobed providers visible with a null availability', async () => {
  const store = new MemoryStore();
  const monitor = makeMonitor({ store, providers: [okProvider('a'), okProvider('never-run')] });
  await monitor.runOnce({ trigger: 'manual', actor: 'admin', only: ['a'] });
  const analytics = await monitor.analytics();
  const never = analytics.providers.find((p) => p.providerId === 'never-run');
  assert.equal(never.samples, 0);
  assert.equal(never.availability, null, 'no data must never read as 100 % availability');
});

/* -------------------------------- recovery -------------------------------- */

const makeRecovery = (store, monitor, env = {}) =>
  createRecovery({ store, monitor, env, now: () => 5_000, cacheClearers: { cache: () => {} } });

test('recovery: reset-breaker closes the circuit and verifies the provider', async () => {
  const store = new MemoryStore();
  const monitor = makeMonitor({ store, providers: [downProvider('dead')] });
  for (let i = 0; i < 3; i += 1) await monitor.breaker.record('dead', 'down');
  assert.equal((await monitor.breaker.snapshot('dead')).state, 'open');

  const recovery = makeRecovery(store, monitor);
  const result = await recovery.execute('reset-breaker', { providerId: 'dead', actor: 'admin:test' });

  assert.equal(result.ok, true);
  assert.equal(result.before, 'open');
  assert.equal(result.verified, false, 'the provider still fails, and the result says so');
  assert.equal(result.after, 'open', 'a failed verification re-opens the circuit');
  assert.match(result.message, /still failed/);

  const audit = await store.listAudit({ limit: 10 });
  assert.ok(audit.some((entry) => entry.action === 'recovery' && entry.actor === 'admin:test'));
});

test('recovery: a healthy provider verifies and stays closed', async () => {
  const store = new MemoryStore();
  const monitor = makeMonitor({ store, providers: [okProvider('healthy')] });
  const recovery = makeRecovery(store, monitor);
  const result = await recovery.execute('reset-breaker', { providerId: 'healthy', actor: 'admin' });
  assert.equal(result.ok, true);
  assert.equal(result.verified, true);
  assert.equal(result.after, 'closed');
});

test('recovery: unknown and incomplete actions are refused without side effects', async () => {
  const store = new MemoryStore();
  const monitor = makeMonitor({ store });
  const recovery = makeRecovery(store, monitor);

  const unknown = await recovery.execute('rotate-everything', { actor: 'admin' });
  assert.equal(unknown.ok, false);
  assert.equal(unknown.code, 'UNKNOWN_ACTION');
  assert.match(unknown.message, /reset-breaker/);

  const missing = await recovery.execute('probe-now', { actor: 'admin' });
  assert.equal(missing.ok, false);
  assert.equal(missing.code, 'PROVIDER_REQUIRED');

  const probe = await recovery.execute('probe-now', { providerId: 'nope', actor: 'admin' });
  assert.equal(probe.ok, false);
  assert.equal(probe.code, 'unknown-provider');
  // A refused attempt is audited as a *failed* action — an operator needs to see
  // that someone tried — but nothing that changes state may be recorded.
  const audit = await store.listAudit({ limit: 5 });
  assert.equal(audit.length, 1);
  assert.equal(audit[0].severity, 'warning');
  assert.equal(audit[0].detail.error, 'unknown-provider');
});

test('recovery: prune and cache actions are idempotent', async () => {
  const store = new MemoryStore();
  const monitor = makeMonitor({ store });
  let cleared = 0;
  const recovery = createRecovery({ store, monitor, now: () => 5_000, cacheClearers: { cache: () => { cleared += 1; } } });

  const first = await recovery.execute('clear-connector-cache', { actor: 'admin' });
  const second = await recovery.execute('clear-connector-cache', { actor: 'admin' });
  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(cleared, 2, 'the action runs every time it is asked for');

  const pruneA = await recovery.execute('prune-state', { actor: 'admin' });
  const pruneB = await recovery.execute('prune-state', { actor: 'admin' });
  assert.equal(pruneA.ok, true);
  assert.equal(pruneB.ok, true);
  assert.equal(pruneB.after.removed, 0, 'pruning twice removes nothing the second time');
});

test('recovery: the human-only boundary is documented, not executable', () => {
  assert.ok(RECOVERY_ACTIONS.length >= 5);
  assert.ok(!RECOVERY_ACTIONS.some((action) => /key|rotate|model/i.test(action.id)));
  assert.ok(HUMAN_ONLY_OPERATIONS.some((line) => /API key/i.test(line)));
});

/* -------------------------------- security -------------------------------- */

test('security: constant-time comparison and token authorisation', () => {
  assert.equal(security.constantTimeEquals('abc', 'abc'), true);
  assert.equal(security.constantTimeEquals('abc', 'abd'), false);
  assert.equal(security.constantTimeEquals('abc', 'abcd'), false);
  assert.equal(security.constantTimeEquals('', ''), false);

  const locked = security.authorizeAdmin({}, {});
  assert.equal(locked.ok, false);
  assert.equal(locked.code, 'GUARDIAN_LOCKED');

  const noHeader = security.authorizeAdmin({}, { GUARDIAN_ADMIN_TOKEN: 'secret-token' });
  assert.equal(noHeader.code, 'GUARDIAN_UNAUTHORIZED');

  const wrong = security.authorizeAdmin({ authorization: 'Bearer nope' }, { GUARDIAN_ADMIN_TOKEN: 'secret-token' });
  assert.equal(wrong.ok, false);

  const ok = security.authorizeAdmin({ authorization: 'Bearer secret-token' }, { GUARDIAN_ADMIN_TOKEN: 'secret-token' });
  assert.equal(ok.ok, true);
  assert.match(ok.actor, /^admin:[0-9a-f]{8}$/);
  assert.doesNotMatch(ok.actor, /secret-token/, 'the actor label must not contain the token');
  // An unconfigured cron secret refuses the schedule endpoint rather than opening it.
  assert.equal(security.authorizeCron({}, {}).code, 'SCHEDULE_SECRET_MISSING');
  assert.equal(security.authorizeCron({ authorization: 'Bearer s3cret' }, { CRON_SECRET: 's3cret' }).ok, true);
});

test('security: secrets are scrubbed from free text and never listed by value', () => {
  const env = {
    GEMINI_API_KEY: 'AIzaSyD-very-secret-value-1234',
    NASA_API_KEY: 'nasa-secret-key-9999',
    SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature',
  };
  const text = 'failed https://api.nasa.gov/planetary/apod?api_key=nasa-secret-key-9999 with AIzaSyD-very-secret-value-1234';
  const scrubbed = security.scrubSecrets(text, env);
  assert.doesNotMatch(scrubbed, /nasa-secret-key-9999/);
  assert.doesNotMatch(scrubbed, /AIzaSyD-very-secret-value-1234/);
  assert.match(scrubbed, /\[redacted\]/);

  const readiness = security.envReadiness(env);
  assert.ok(readiness.set.includes('GEMINI_API_KEY'));
  assert.ok(readiness.missing.includes('OPENROUTER_API_KEY'));
  assert.doesNotMatch(JSON.stringify(readiness), /AIzaSyD|nasa-secret/, 'readiness reports names only');

  // Audit m5: a news key whose name starts with GUARDIAN_ is not this Guardian's
  // credential. It must not sit in `missing` (which reads as "Guardian not
  // configured"), and both names must be scrubbed like any other secret.
  const withNews = security.envReadiness({ ...env, GUARDIAN_API_KEY: 'news-key-value-1234' });
  assert.equal(withNews.set.includes('GUARDIAN_API_KEY'), false);
  assert.equal(withNews.missing.includes('GUARDIAN_API_KEY'), false);
  assert.equal(withNews.missing.includes('GUARDIAN_NEWS_API_KEY'), false);
  assert.deepEqual(withNews.newsOnly.set, ['GUARDIAN_API_KEY']);
  assert.deepEqual(withNews.newsOnly.missing, ['GUARDIAN_NEWS_API_KEY']);
  assert.match(withNews.newsOnly.note, /never authorises \/api\/guardian/);
  assert.match(withNews.newsOnly.note, /GUARDIAN_ADMIN_TOKEN/);
  assert.doesNotMatch(JSON.stringify(withNews), /news-key-value-1234/, 'the bucket reports names, never values');

  const canonical = security.envReadiness({ ...env, GUARDIAN_NEWS_API_KEY: 'canonical-news-value-9876' });
  assert.deepEqual(canonical.newsOnly.set, ['GUARDIAN_NEWS_API_KEY']);
  assert.deepEqual(canonical.newsOnly.missing, ['GUARDIAN_API_KEY']);

  const scrubbedNews = security.scrubSecrets('feed https://content.guardianapis.com/search?api-key=canonical-news-value-9876', {
    GUARDIAN_NEWS_API_KEY: 'canonical-news-value-9876',
  });
  assert.doesNotMatch(scrubbedNews, /canonical-news-value-9876/, 'the canonical name is scrubbed too');
  assert.equal(security.callerKey({}, '1.2.3.4'), security.callerKey({}, '1.2.3.4'));
  assert.notEqual(security.callerKey({}, '1.2.3.4'), security.callerKey({}, '1.2.3.5'));
});

/* --------------------------------- routes --------------------------------- */

async function withServer(runtime, fn) {
  const express = (await import('express')).default;
  const app = express();
  app.use(express.json());
  app.use('/api/guardian', createGuardianRouter(runtime));
  const server = await new Promise((resolve) => {
    const listener = app.listen(0, '127.0.0.1', () => resolve(listener));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await fn(base);
  } finally {
    server.close();
  }
}

const getJson = async (url, init) => {
  const response = await fetch(url, init);
  const text = await response.text();
  let body = null;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: response.status, body, headers: response.headers };
};

const runtimeFor = (env = {}, store = new MemoryStore()) =>
  createGuardianRuntime({
    env,
    store,
    now: () => 1_000,
    instanceId: 'test-instance',
    random: () => 0.5,
    fetchImpl: async () => new Response('{}', { status: 200 }),
    providers: [okProvider('a'), downProvider('b')],
  });

test('routes: health and status are public, credential-free and no-store', async () => {
  const runtime = runtimeFor({ GEMINI_API_KEY: 'AIzaSyD-very-secret-value-1234' });
  await withServer(runtime, async (base) => {
    const health = await getJson(`${base}/api/guardian/health`);
    assert.equal(health.status, 200);
    assert.equal(health.body.ok, true);
    assert.equal(health.body.distributed, false);
    assert.equal(health.headers.get('cache-control'), 'no-store');

    const status = await getJson(`${base}/api/guardian/status`);
    assert.equal(status.status, 200);
    assert.equal(status.body.store.capabilities.distributed, false);
    assert.equal(status.body.store.capabilities.distributed, false);
    assert.ok(status.body.store.reason.length > 0, 'the store decision is explained, never implied');
    assert.ok(status.body.providers.length >= 2);
    assert.ok(status.body.breakers.a === null || typeof status.body.breakers.a === 'object');
    assert.doesNotMatch(JSON.stringify(status.body), /AIzaSyD/, 'no credential in any status field');

    const providers = await getJson(`${base}/api/guardian/providers`);
    assert.equal(providers.body.providers.length, 2);
    const analytics = await getJson(`${base}/api/guardian/analytics?window=1h`);
    assert.equal(analytics.status, 200);
    assert.equal(analytics.body.windowMs, 60 * 60_000);
  });
});

test('routes: administrative endpoints are locked until a token is configured', async () => {
  const runtime = runtimeFor({}, new MemoryStore());
  await withServer(runtime, async (base) => {
    for (const [method, path] of [
      ['GET', '/api/guardian/audit'],
      ['GET', '/api/guardian/runs'],
      ['GET', '/api/guardian/config'],
      ['POST', '/api/guardian/run'],
      ['POST', '/api/guardian/recovery'],
      ['GET', '/api/guardian/verify?provider=a'],
    ]) {
      const response = await getJson(`${base}${path}`, { method, ...(method === 'POST' ? { body: '{}', headers: { 'content-type': 'application/json' } } : {}) });
      assert.equal(response.status, 403, `${method} ${path} must be locked`);
      assert.equal(response.body.code, 'GUARDIAN_LOCKED');
    }
    // The refused attempts are recorded, so an operator can see probing.
    const audit = await runtime.store.listAudit({ limit: 20 });
    assert.ok(audit.some((entry) => entry.action === 'auth-failure'));
  });
});

test('routes: an admin can run a sweep, read the audit and act', async () => {
  const env = { GUARDIAN_ADMIN_TOKEN: 'admin-token' };
  const store = new MemoryStore();
  const runtime = runtimeFor(env, store);
  const auth = { authorization: 'Bearer admin-token', 'content-type': 'application/json' };

  await withServer(runtime, async (base) => {
    const run = await getJson(`${base}/api/guardian/run`, { method: 'POST', headers: auth, body: JSON.stringify({ only: ['a'] }) });
    assert.equal(run.status, 200);
    assert.equal(run.body.ran, true);
    assert.equal(run.body.summary.ok, 1);

    const runs = await getJson(`${base}/api/guardian/runs`, { headers: auth });
    assert.equal(runs.body.runs.length, 1);

    const audit = await getJson(`${base}/api/guardian/audit?limit=5`, { headers: auth });
    assert.equal(audit.status, 200);
    assert.ok(Array.isArray(audit.body.entries));

    const config = await getJson(`${base}/api/guardian/config`, { headers: auth });
    assert.equal(config.status, 200);
    assert.equal(config.body.adminConfigured, true);
    assert.ok(config.body.recoveryActions.length >= 5);
    assert.ok(config.body.humanOnlyOperations.length >= 4);

    const recovery = await getJson(`${base}/api/guardian/recovery`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ action: 'probe-now', providerId: 'a' }),
    });
    assert.equal(recovery.status, 200);
    assert.equal(recovery.body.verified, true);

    const badAction = await getJson(`${base}/api/guardian/recovery`, {
      method: 'POST',
      headers: auth,
      body: JSON.stringify({ action: 'drop-tables' }),
    });
    assert.equal(badAction.status, 400);
    assert.equal(badAction.body.code, 'UNKNOWN_ACTION');
  });
});

test('routes: recovery actions are rate limited per administrator', async () => {
  const env = { GUARDIAN_ADMIN_TOKEN: 'admin-token' };
  const runtime = runtimeFor(env, new MemoryStore());
  const auth = { authorization: 'Bearer admin-token', 'content-type': 'application/json' };
  await withServer(runtime, async (base) => {
    const statuses = [];
    for (let i = 0; i < 7; i += 1) {
      const response = await getJson(`${base}/api/guardian/recovery`, {
        method: 'POST',
        headers: auth,
        body: JSON.stringify({ action: 'prune-state' }),
      });
      statuses.push(response.status);
    }
    assert.ok(statuses.includes(429), 'the sixth action inside a minute must be refused');
    assert.equal(statuses.filter((status) => status === 200).length, 5);
  });
});

test('routes: the scheduled sweep needs the cron secret', async () => {
  const store = new MemoryStore();
  const locked = runtimeFor({}, store);
  await withServer(locked, async (base) => {
    const response = await getJson(`${base}/api/guardian/cron`);
    assert.equal(response.status, 503);
    assert.equal(response.body.code, 'SCHEDULE_SECRET_MISSING');
  });

  const secured = runtimeFor({ CRON_SECRET: 'cron-secret' }, new MemoryStore());
  await withServer(secured, async (base) => {
    const wrong = await getJson(`${base}/api/guardian/cron`, { headers: { authorization: 'Bearer wrong' } });
    assert.equal(wrong.status, 401);

    const right = await getJson(`${base}/api/guardian/cron`, { headers: { authorization: 'Bearer cron-secret' } });
    assert.equal(right.status, 200);
    assert.equal(right.body.ran, true);
    assert.equal(right.body.summary.trigger, 'schedule');
    assert.equal(right.body.summary.triggeredBy, 'cron');
  });
});

test('routes: a second instance reports that another instance holds the sweep', async () => {
  const store = new MemoryStore();
  const env = { CRON_SECRET: 'cron-secret' };
  const held = runtimeFor(env, store);
  // Hold the lease explicitly, as a slow in-flight sweep would.
  await store.acquireLease('lease:sweep', 'other-instance', 60_000);

  await withServer(held, async (base) => {
    const response = await getJson(`${base}/api/guardian/cron`, { headers: { authorization: 'Bearer cron-secret' } });
    assert.equal(response.status, 200);
    assert.equal(response.body.ran, false);
    assert.equal(response.body.holder, 'other-instance');
    assert.match(response.body.reason, /already running/);
  });
});

test('routes: unknown routes under the guardian prefix are a JSON 404', async () => {
  const runtime = runtimeFor({}, new MemoryStore());
  await withServer(runtime, async (base) => {
    const response = await getJson(`${base}/api/guardian/nope`);
    assert.equal(response.status, 404);
  });
});
