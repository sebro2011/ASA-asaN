/**
 * COSMORA API Guardian — storage, breaker, rate limiter and lease contracts.
 *
 * The distributed behaviour is tested by giving two independent coordinators the
 * *same* store and asserting they cannot both act: that is exactly the failure a
 * process-local implementation cannot prevent, and the reason these primitives
 * live in a store at all.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-guardian-core.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

const {
  MemoryStore,
  PostgresStore,
  StoreError,
  createGuardianStore,
  isServiceRoleKey,
} = await import('../server/guardian/store.ts');
const { createBreaker, describeBreaker, DEFAULT_BREAKER_CONFIG } = await import('../server/guardian/breaker.ts');
const { createFleetRateLimiter, DEFAULT_QUOTAS, quotaFromEnv } = await import('../server/guardian/rateLimit.ts');
const { acquireLease, withLease, newInstanceId } = await import('../server/guardian/lease.ts');

/* ------------------------------- memory store ------------------------------ */

test('memory store: values, versions, expiry and create-only CAS', async () => {
  let clock = 1_000;
  const store = new MemoryStore({}, () => clock);

  assert.equal(await store.getJson('missing'), null);

  const first = await store.setJson('k', { a: 1 });
  assert.equal(first.version, 1);
  assert.equal(first.expiresAt, null);

  const second = await store.setJson('k', { a: 2 });
  assert.equal(second.version, 2);

  // CAS with the stale version must fail and leave the value untouched.
  const stale = await store.compareAndSetJson('k', 1, { a: 99 });
  assert.equal(stale.ok, false);
  assert.deepEqual((await store.getJson('k')).value, { a: 2 });

  const ok = await store.compareAndSetJson('k', 2, { a: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.stored.version, 3);

  // Create-only semantics.
  const createExisting = await store.compareAndSetJson('k', null, { a: 4 });
  assert.equal(createExisting.ok, false);
  const createNew = await store.compareAndSetJson('fresh', null, { a: 5 });
  assert.equal(createNew.ok, true);

  // TTL.
  await store.setJson('ttl', { t: 1 }, { ttlMs: 500 });
  clock += 499;
  assert.ok(await store.getJson('ttl'), 'still alive one ms before expiry');
  clock += 2;
  assert.ok((await store.prune()) >= 1, 'prune reports the expired key');
  assert.equal(await store.getJson('ttl'), null, 'expired after the TTL');
});

test('memory store: fixed window counters reset and accumulate', async () => {
  let clock = 0;
  const store = new MemoryStore({}, () => clock);
  const a = await store.increment('rl', 1_000);
  assert.equal(a.count, 1);
  assert.equal(a.resetAt, 1_000);
  const b = await store.increment('rl', 1_000, 3);
  assert.equal(b.count, 4);
  assert.equal(b.resetAt, 1_000);
  clock = 1_001;
  const c = await store.increment('rl', 1_000);
  assert.equal(c.count, 1, 'a new window starts after the reset');
  assert.equal(c.resetAt, 2_001);
});

test('memory store: lease acquisition, ownership, renewal and expiry takeover', async () => {
  let clock = 0;
  const store = new MemoryStore({}, () => clock);

  assert.equal(await store.acquireLease('sweep', 'A', 1_000), true);
  assert.equal(await store.acquireLease('sweep', 'B', 1_000), false, 'B cannot take a live lease');
  assert.deepEqual(await store.leaseHolder('sweep'), { owner: 'A', expiresAt: 1_000 });

  assert.equal(await store.renewLease('sweep', 'B', 1_000), false, 'only the owner renews');
  assert.equal(await store.renewLease('sweep', 'A', 1_000), true);

  clock = 1_001;
  assert.equal(await store.acquireLease('sweep', 'B', 1_000), true, 'expired leases are taken over');
  assert.equal((await store.leaseHolder('sweep')).owner, 'B');

  // Release is owner-scoped: A cannot release B's lease.
  await store.releaseLease('sweep', 'A');
  assert.equal((await store.leaseHolder('sweep')).owner, 'B');
  await store.releaseLease('sweep', 'B');
  assert.equal(await store.leaseHolder('sweep'), null);
});

test('memory store: audit, samples and runs are bounded and filtered', async () => {
  let clock = 0;
  const store = new MemoryStore({ maxSamples: 3, maxAudit: 3, maxRuns: 2 }, () => clock);
  for (let i = 0; i < 5; i += 1) {
    clock += 1;
    await store.appendAudit({
      at: clock,
      actor: i % 2 ? 'scheduler' : 'admin@example.test',
      action: i % 2 ? 'probe' : 'recovery',
      target: 'nasa:apod',
      severity: i === 4 ? 'critical' : 'info',
      detail: { n: i },
    });
  }
  const all = await store.listAudit({ limit: 10 });
  assert.equal(all.length, 3, 'audit retention is bounded');
  assert.equal(all[0].severity, 'critical', 'newest first');
  // Retained entries are the newest three: actors admin/scheduler/admin.
  assert.equal((await store.listAudit({ actor: 'admin@example.test' })).length, 2);
  assert.equal((await store.listAudit({ action: 'probe' })).length, 1);

  for (let i = 0; i < 5; i += 1) {
    await store.appendSample({ at: i, providerId: 'p', status: 'ok', code: 'OK', latencyMs: i });
  }
  const samples = await store.listSamples({ limit: 10 });
  assert.equal(samples.length, 3);
  assert.equal(samples[0].latencyMs, 4);
  assert.equal((await store.listSamples({ providerId: 'other' })).length, 0);

  for (let i = 0; i < 4; i += 1) {
    await store.putRun({
      id: `run-${i}`,
      startedAt: i,
      finishedAt: i + 1,
      trigger: 'schedule',
      instanceId: 'i',
      summary: null,
    });
  }
  assert.equal((await store.listRuns({ limit: 10 })).length, 2);
  // putRun is an upsert, not an append.
  await store.putRun({ id: 'run-3', startedAt: 3, finishedAt: 9, trigger: 'manual', instanceId: 'i', summary: null });
  const runs = await store.listRuns({ limit: 10 });
  assert.equal(runs.filter((run) => run.id === 'run-3').length, 1);
  assert.equal(runs[0].finishedAt, 9);
});

/* --------------------------------- breaker -------------------------------- */

const makeProvider = (id, status = 'ok', code = 'OK') => ({
  providerId: id,
  status,
  code,
  latencyMs: 5,
  checkedAt: 0,
});

test('breaker: opens after the threshold and denies during the cooldown', async () => {
  let clock = 1_000;
  const store = new MemoryStore({}, () => clock);
  const breaker = createBreaker(store, {
    config: { failureThreshold: 2, cooldownMs: 1_000, jitter: 0 },
    now: () => clock,
    random: () => 0.5,
  });

  assert.deepEqual(await breaker.allow('nasa'), { allowed: true, state: 'closed' });
  await breaker.record('nasa', makeProvider('nasa', 'down', 'UPSTREAM_5XX'));
  assert.equal((await breaker.allow('nasa')).allowed, true, 'one failure is not enough');

  await breaker.record('nasa', makeProvider('nasa', 'down', 'UPSTREAM_5XX'));
  const denied = await breaker.allow('nasa');
  assert.equal(denied.allowed, false);
  assert.equal(denied.state, 'open');
  assert.equal(denied.retryAt, 2_000, 'cooldown is measured from the trip');

  clock = 2_001;
  const trial = await breaker.allow('nasa');
  assert.equal(trial.allowed, true);
  assert.equal(trial.trial, true);
  assert.equal(trial.state, 'half-open');
  assert.match(describeBreaker(await breaker.snapshot('nasa')), /half-open/);

  // Success closes the circuit and clears the failure count.
  await breaker.record('nasa', 'ok');
  const closed = await breaker.snapshot('nasa');
  assert.equal(closed.state, 'closed');
  assert.equal(closed.failures, 0);
  assert.equal(closed.lastSuccessAt, 2_001);
});

test('breaker: exactly one instance wins the half-open trial (shared store)', async () => {
  let clock = 0;
  const store = new MemoryStore({}, () => clock);
  const config = { failureThreshold: 1, cooldownMs: 1_000, jitter: 0 };
  // Two coordinators, one store: a stand-in for two serverless instances.
  const a = createBreaker(store, { config, now: () => clock, random: () => 0 });
  const b = createBreaker(store, { config, now: () => clock, random: () => 0 });

  await a.record('gemini', 'down');
  assert.equal((await b.allow('gemini')).allowed, false, 'B sees the trip that A recorded');

  clock = 1_001;
  const results = await Promise.all([a.allow('gemini'), b.allow('gemini')]);
  const winners = results.filter((r) => r.allowed);
  assert.equal(winners.length, 1, 'only one trial may run across the fleet');
  assert.equal(winners[0].trial, true);
});

test('breaker: cooldown jitter stays inside the configured band', async () => {
  let clock = 0;
  const store = new MemoryStore({}, () => clock);
  const breaker = createBreaker(store, {
    config: { failureThreshold: 1, cooldownMs: 10_000, jitter: 0.25 },
    now: () => clock,
    random: () => 1,
  });
  await breaker.record('p', 'down');
  const state = await breaker.snapshot('p');
  assert.equal(state.cooldownUntil, 12_500, 'cooldown + 25 % jitter at random = 1');
});

test('breaker: a store outage fails open instead of blocking traffic', async () => {
  const brokenStore = {
    ...new MemoryStore(),
    async getJson() {
      throw new StoreError('down', 'STORE_NETWORK');
    },
    async compareAndSetJson() {
      throw new StoreError('down', 'STORE_NETWORK');
    },
    async setJson() {
      throw new StoreError('down', 'STORE_NETWORK');
    },
  };
  const breaker = createBreaker(brokenStore);
  const decision = await breaker.allow('nasa');
  assert.equal(decision.allowed, true);
  assert.equal(decision.storeDegraded, true);
  assert.equal(await breaker.record('nasa', 'down'), null, 'recording never throws');
});

test('breaker: degraded outcomes are counted but do not open the circuit', async () => {
  const store = new MemoryStore();
  const breaker = createBreaker(store, { config: { failureThreshold: 2 } });
  await breaker.record('earth', { providerId: 'earth', status: 'degraded', code: 'SLOW', latencyMs: 9_000, checkedAt: 0 });
  await breaker.record('earth', { providerId: 'earth', status: 'degraded', code: 'SLOW', latencyMs: 9_000, checkedAt: 0 });
  const state = await breaker.snapshot('earth');
  assert.equal(state.degradations, 2);
  assert.equal(state.state, 'closed');
  assert.equal((await breaker.allow('earth')).allowed, true);
});

test('breaker: reset clears the record explicitly', async () => {
  const store = new MemoryStore();
  const breaker = createBreaker(store, { config: { failureThreshold: 1 } });
  await breaker.record('arena', 'down');
  assert.equal((await breaker.allow('arena')).allowed, false);
  await breaker.reset('arena');
  assert.equal((await breaker.allow('arena')).allowed, true);
  assert.equal(DEFAULT_BREAKER_CONFIG.failureThreshold, 3);
});

/* ------------------------------ rate limiter ------------------------------ */

test('rate limiter: enforces the limit inside one window', async () => {
  let clock = 0;
  const store = new MemoryStore({}, () => clock);
  const limiter = createFleetRateLimiter(store, { now: () => clock, quotas: { 'test:one': { limit: 2, windowMs: 1_000 } } });

  const first = await limiter.check('test:one');
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 1);
  const second = await limiter.check('test:one');
  assert.equal(second.allowed, true);
  assert.equal(second.remaining, 0);
  const third = await limiter.check('test:one');
  assert.equal(third.allowed, false);
  assert.equal(third.remaining, 0);
  assert.equal(third.resetAt, 1_000);

  clock = 1_001;
  assert.equal((await limiter.check('test:one')).allowed, true, 'the window rolls over');
});

test('rate limiter: the budget is fleet-wide, not per instance', async () => {
  const clock = 0;
  const store = new MemoryStore({}, () => clock);
  const a = createFleetRateLimiter(store, { now: () => clock, quotas: { 'nasa:key': { limit: 3, windowMs: 60_000 } } });
  const b = createFleetRateLimiter(store, { now: () => clock, quotas: { 'nasa:key': { limit: 3, windowMs: 60_000 } } });

  assert.equal((await a.check('nasa:key')).allowed, true);
  assert.equal((await b.check('nasa:key')).allowed, true);
  assert.equal((await a.check('nasa:key')).allowed, true);
  // Fourth request of the window, from either instance, must be refused.
  assert.equal((await b.check('nasa:key')).allowed, false);
  assert.equal((await a.check('nasa:key')).allowed, false);
});

test('rate limiter: cost is respected and unknown buckets are not unlimited', async () => {
  const store = new MemoryStore();
  const limiter = createFleetRateLimiter(store, {
    quotas: { 'heavy:call': { limit: 5, windowMs: 60_000, cost: 3 } },
  });
  const first = await limiter.check('heavy:call');
  assert.equal(first.allowed, true);
  assert.equal(first.remaining, 2);
  const second = await limiter.check('heavy:call');
  assert.equal(second.allowed, false, 'two calls of cost 3 exceed a limit of 5');

  const unknown = await limiter.check('some:new-bucket');
  assert.equal(unknown.limit, 30, 'unknown buckets get a conservative default');
});

test('rate limiter: a store outage fails open and says so', async () => {
  const brokenStore = {
    ...new MemoryStore(),
    async increment() {
      throw new StoreError('down', 'STORE_NETWORK');
    },
  };
  const limiter = createFleetRateLimiter(brokenStore);
  const decision = await limiter.check('gemini:generate');
  assert.equal(decision.allowed, true);
  assert.equal(decision.degraded, true);
});

test('rate limiter: defaults sit below published provider quotas', () => {
  assert.ok(DEFAULT_QUOTAS['nasa:key'].limit * 60 <= 1_000, 'NASA key budget stays under 1000/hour');
  assert.ok(DEFAULT_QUOTAS['nasa:demo'].limit <= 30, 'DEMO_KEY budget stays under 30/hour');
  assert.equal(DEFAULT_QUOTAS['nasa:demo'].windowMs, 60 * 60_000);
  assert.equal(quotaFromEnv({ X: '7' }, 'X', { limit: 1, windowMs: 1_000 }).limit, 7);
  assert.equal(quotaFromEnv({ X: 'nope' }, 'X', { limit: 1, windowMs: 1_000 }).limit, 1);
});

/* ---------------------------------- lease --------------------------------- */

test('lease: two instances cannot hold the same lease', async () => {
  const clock = 0;
  const store = new MemoryStore({}, () => clock);
  const a = await acquireLease(store, { key: 'sweep', owner: 'A', ttlMs: 5_000 });
  const b = await acquireLease(store, { key: 'sweep', owner: 'B', ttlMs: 5_000 });
  assert.ok(a);
  assert.equal(b, null);
  await a.release();
  assert.ok(await acquireLease(store, { key: 'sweep', owner: 'B', ttlMs: 5_000 }));
});

test('lease: withLease runs once, releases afterwards, and reports the holder', async () => {
  const store = new MemoryStore();
  let ran = 0;
  const first = await withLease(store, { key: 'job', owner: 'A', ttlMs: 5_000 }, async () => {
    ran += 1;
    return 'done';
  });
  assert.deepEqual(first, { acquired: true, value: 'done' });
  assert.equal(ran, 1);
  assert.equal(await store.leaseHolder('job'), null, 'the lease is released in the finally block');

  const handle = await acquireLease(store, { key: 'job', owner: 'B', ttlMs: 5_000 });
  const second = await withLease(store, { key: 'job', owner: 'A', ttlMs: 5_000 }, async () => 'nope');
  assert.equal(second.acquired, false);
  assert.equal(second.holder, 'B');
  await handle.release();
});

test('lease: a throwing job still releases the lease', async () => {
  const store = new MemoryStore();
  await assert.rejects(
    withLease(store, { key: 'job', owner: 'A', ttlMs: 5_000 }, async () => {
      throw new Error('boom');
    }),
  );
  assert.equal(await store.leaseHolder('job'), null);
});

test('lease: instance ids are unique and readable', () => {
  const ids = new Set(Array.from({ length: 50 }, () => newInstanceId()));
  assert.equal(ids.size, 50);
  for (const id of ids) assert.match(id, /^gdn-[a-z0-9]+-[a-z0-9]+$/);
});

/* ----------------------------- postgres adapter ---------------------------- */

const svcJwt = (() => {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url');
  return `${header}.${payload}.signature`;
})();

function fakePostgrest(handler) {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url, init });
    return handler(url, init, calls.length);
  };
  return { calls, fetchImpl };
}

const jsonResponse = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('postgres adapter: RPC bodies are scoped, and no key is ever in a URL', async () => {
  const { calls, fetchImpl } = fakePostgrest((url) => {
    if (url.includes('guardian_kv_get')) return jsonResponse([{ value: { a: 1 }, version: 4, expires_at: null }]);
    if (url.includes('guardian_counter')) return jsonResponse([{ count: 3, reset_at: new Date(5_000).toISOString() }]);
    if (url.includes('guardian_lease')) return jsonResponse(true);
    return jsonResponse([]);
  });
  const store = new PostgresStore({ url: 'https://project.supabase.co', serviceRoleKey: svcJwt, fetchImpl, namespace: 'ns1' });

  const value = await store.getJson('breaker:x');
  assert.deepEqual(value, { value: { a: 1 }, version: 4, expiresAt: null });

  const counter = await store.increment('rl', 1_000, 2);
  assert.equal(counter.count, 3);
  assert.equal(counter.resetAt, 5_000);

  assert.equal(await store.acquireLease('sweep', 'A', 1_000), true);

  const getBody = JSON.parse(calls[0].init.body);
  assert.equal(getBody.p_key, 'ns1:breaker:x');
  const counterBody = JSON.parse(calls[1].init.body);
  assert.equal(counterBody.p_key, 'ns1:rl');
  assert.equal(counterBody.p_amount, 2);

  for (const call of calls) {
    assert.doesNotMatch(call.url, /service_role|eyJ/, 'the key must never appear in a URL');
    assert.equal(call.init.headers.apikey, svcJwt, 'the key travels in a header');
  }
});

test('postgres adapter: HTTP failures become typed errors without leaking the URL', async () => {
  const { fetchImpl } = fakePostgrest(() => new Response('nope', { status: 503 }));
  const store = new PostgresStore({ url: 'https://project.supabase.co', serviceRoleKey: svcJwt, fetchImpl });
  await assert.rejects(store.getJson('k'), (error) => {
    assert.ok(error instanceof StoreError);
    assert.equal(error.code, 'STORE_HTTP');
    assert.equal(error.status, 503);
    assert.doesNotMatch(error.message, /supabase\.co|eyJ/);
    return true;
  });

  const badJson = fakePostgrest(() => new Response('not json', { status: 200 }));
  const store2 = new PostgresStore({ url: 'https://project.supabase.co', serviceRoleKey: svcJwt, fetchImpl: badJson.fetchImpl });
  await assert.rejects(store2.getJson('k'), /non-JSON/);
});

test('postgres adapter: a hanging store times out as STORE_TIMEOUT', async () => {
  const fetchImpl = (url, init) =>
    new Promise((_resolve, reject) => {
      init.signal.addEventListener('abort', () => {
        const error = new Error('aborted');
        error.name = 'AbortError';
        reject(error);
      });
    });
  const store = new PostgresStore({ url: 'https://project.supabase.co', serviceRoleKey: svcJwt, fetchImpl, timeoutMs: 20 });
  await assert.rejects(store.getJson('k'), (error) => {
    assert.equal(error.code, 'STORE_TIMEOUT');
    return true;
  });
});

test('postgres adapter: a lost CAS is reported, not retried', async () => {
  const { calls, fetchImpl } = fakePostgrest(() => jsonResponse([{ ok: false, version: null, expires_at: null }]));
  const store = new PostgresStore({ url: 'https://project.supabase.co', serviceRoleKey: svcJwt, fetchImpl });
  const result = await store.compareAndSetJson('k', 2, { a: 1 });
  assert.equal(result.ok, false);
  assert.equal(result.stored, null);
  assert.equal(calls.length, 1);
});

test('postgres adapter: audit and samples map rows back to the domain shape', async () => {
  const { fetchImpl, calls } = fakePostgrest((url) => {
    if (url.includes('guardian_audit') && url.includes('select=')) {
      return jsonResponse([
        { id: 7, at: '2026-11-12T10:00:00.000Z', actor: 'admin', action: 'recovery', target: 'nasa:apod', severity: 'warning', detail: { step: 1 } },
      ]);
    }
    if (url.includes('guardian_samples') && url.includes('select=')) {
      return jsonResponse([
        { at: '2026-11-12T10:00:00.000Z', provider_id: 'nasa:apod', status: 'ok', code: 'OK', latency_ms: 120, http_status: 200, reason: null, run_id: 'r1' },
      ]);
    }
    if (url.includes('guardian_runs') && url.includes('select=')) {
      return jsonResponse([
        { id: 'r1', started_at: '2026-11-12T10:00:00.000Z', finished_at: null, trigger: 'schedule', instance_id: 'i1', summary: null, error: null },
      ]);
    }
    return jsonResponse([{ id: 9, at: '2026-11-12T10:00:00.000Z' }]);
  });
  const store = new PostgresStore({ url: 'https://project.supabase.co', serviceRoleKey: svcJwt, fetchImpl });

  const audit = await store.appendAudit({ at: 0, actor: 'admin', action: 'recovery', target: 'x', severity: 'info' });
  assert.equal(audit.id, 'pg-9');

  const listed = await store.listAudit({ limit: 5, severity: 'warning', target: 'nasa:apod' });
  assert.equal(listed.length, 1);
  assert.equal(listed[0].severity, 'warning');
  assert.ok(calls.at(-1).url.includes('severity=eq.warning'));

  const samples = await store.listSamples({ providerId: 'nasa:apod' });
  assert.equal(samples[0].latencyMs, 120);
  assert.equal(samples[0].runId, 'r1');

  const runs = await store.listRuns();
  assert.equal(runs[0].trigger, 'schedule');
  assert.equal(runs[0].finishedAt, null);
});

test('postgres adapter: describe() exposes only the host, never the key', () => {
  const store = new PostgresStore({ url: 'https://project.supabase.co/rest', serviceRoleKey: svcJwt, namespace: 'n' });
  const description = store.describe();
  assert.equal(description.kind, 'postgres');
  assert.equal(description.host, 'project.supabase.co');
  assert.doesNotMatch(JSON.stringify(description), /eyJ|supabase\.co\/rest/);
  assert.equal(store.capabilities.distributed, true);
});

/* --------------------------------- factory -------------------------------- */

test('service-role key detection rejects publishable and malformed keys', () => {
  assert.equal(isServiceRoleKey(svcJwt), true);
  assert.equal(isServiceRoleKey('sb_secret_abcdefghijklmnop'), true);
  assert.equal(isServiceRoleKey('sb_publishable_abcdefghijklmnop'), false);
  assert.equal(isServiceRoleKey(''), false);
  assert.equal(isServiceRoleKey('not-a-jwt'), false);
  const anon = `${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.sig`;
  assert.equal(isServiceRoleKey(anon), false);
});

test('factory: falls back to the memory store and names what is missing', () => {
  const noUrl = createGuardianStore({});
  assert.equal(noUrl.store.kind, 'memory');
  assert.equal(noUrl.store.capabilities.distributed, false);
  assert.match(noUrl.reason, /instance-local/);
  assert.deepEqual(noUrl.missing, ['SUPABASE_URL']);

  const noKey = createGuardianStore({ SUPABASE_URL: 'https://project.supabase.co' });
  assert.equal(noKey.store.kind, 'memory');
  assert.deepEqual(noKey.missing, ['SUPABASE_SERVICE_ROLE_KEY']);

  const anon = createGuardianStore({
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_abcdefghijklmnop',
  });
  assert.equal(anon.store.kind, 'memory');
  assert.match(anon.reason, /service-role/);

  const insecure = createGuardianStore({
    GUARDIAN_STORE_URL: 'http://project.supabase.co',
    GUARDIAN_STORE_KEY: svcJwt,
  });
  assert.equal(insecure.store.kind, 'memory', 'plain http is refused');

  const invalid = createGuardianStore({ SUPABASE_URL: 'not a url', SUPABASE_SERVICE_ROLE_KEY: svcJwt });
  assert.equal(invalid.store.kind, 'memory');
});

test('factory: a valid service-role configuration selects the shared store', () => {
  const selection = createGuardianStore({
    GUARDIAN_STORE_URL: 'https://project.supabase.co',
    GUARDIAN_STORE_KEY: svcJwt,
    GUARDIAN_NAMESPACE: 'prod',
  });
  assert.equal(selection.store.kind, 'postgres');
  assert.equal(selection.store.capabilities.distributed, true);
  assert.equal(selection.missing.length, 0);
  assert.equal(selection.store.describe().namespace, 'prod');
});
