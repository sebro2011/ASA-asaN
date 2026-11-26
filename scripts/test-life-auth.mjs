/** Hosted and local-owner authentication boundary for the L.I.F.E. API. */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createLifeAuthenticator } from '../server/life/auth.js';

const ENV = {
  NODE_ENV: 'production',
  SUPABASE_URL: 'https://life-test.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key_for_life_api',
  NOVA_LIFE_OWNER_ID: 'owner-1',
};

const response = (status, body) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
});

const request = (token, remoteAddress = '203.0.113.20') => ({
  headers: token ? { authorization: `Bearer ${token}` } : {},
  socket: { remoteAddress },
});

test('hosted access tokens are verified with Supabase Auth and bound to one owner', async () => {
  const calls = [];
  const authenticate = createLifeAuthenticator({
    env: ENV,
    fetchImpl: async (url, init) => {
      calls.push({ url, init });
      return init.headers.authorization === 'Bearer valid-owner-token'
        ? response(200, { id: 'owner-1' })
        : init.headers.authorization === 'Bearer other-user-token'
          ? response(200, { id: 'owner-2' })
          : response(401, { message: 'invalid token' });
    },
  });

  assert.deepEqual(await authenticate(request('valid-owner-token')), { id: 'owner-1' });
  assert.equal(calls[0].url, `${ENV.SUPABASE_URL}/auth/v1/user`);
  assert.equal(calls[0].init.method, 'GET');
  assert.equal(calls[0].init.headers.apikey, ENV.SUPABASE_PUBLISHABLE_KEY);
  assert.equal(calls[0].init.headers.authorization, 'Bearer valid-owner-token');
  assert.equal(calls[0].init.redirect, 'error');

  await assert.rejects(
    () => authenticate(request('other-user-token')),
    (error) => error.status === 403 && error.code === 'LIFE_OWNER_ONLY',
  );
  await assert.rejects(
    () => authenticate(request('invalid-owner-token')),
    (error) => error.status === 401 && error.code === 'LIFE_AUTH_INVALID',
  );
  await assert.rejects(
    () => authenticate(request(null)),
    (error) => error.status === 401 && error.code === 'LIFE_AUTH_REQUIRED',
  );
});

test('auth backend outages fail closed and configuration errors do not bypass auth', async () => {
  const unavailable = createLifeAuthenticator({ env: ENV, fetchImpl: async () => response(503, {}) });
  await assert.rejects(
    () => unavailable(request('valid-owner-token')),
    (error) => error.status === 503 && error.code === 'LIFE_AUTH_UNAVAILABLE',
  );

  const missingOwner = createLifeAuthenticator({
    env: { ...ENV, NOVA_LIFE_OWNER_ID: '' },
    fetchImpl: async () => { throw new Error('must not contact Supabase'); },
  });
  await assert.rejects(
    () => missingOwner(request('valid-owner-token')),
    (error) => error.status === 503 && error.code === 'LIFE_AUTH_NOT_CONFIGURED',
  );
});

test('local no-session mode needs an explicit development opt-in and loopback peer', async () => {
  const authenticate = createLifeAuthenticator({
    env: { NODE_ENV: 'development', NOVA_LIFE_ALLOW_UNAUTHENTICATED_LOCAL: '1' },
    fetchImpl: async () => { throw new Error('local mode must not contact Supabase'); },
  });

  assert.deepEqual(await authenticate(request(null, '127.0.0.1')), { id: 'local', local: true });
  await assert.rejects(
    () => authenticate(request(null, '192.168.1.12')),
    (error) => error.code === 'LIFE_AUTH_REQUIRED',
  );

  const production = createLifeAuthenticator({
    env: { NODE_ENV: 'production', NOVA_LIFE_ALLOW_UNAUTHENTICATED_LOCAL: '1' },
  });
  await assert.rejects(
    () => production(request(null, '127.0.0.1')),
    (error) => error.code === 'LIFE_AUTH_REQUIRED',
  );

  const cloudConfigured = createLifeAuthenticator({
    env: { ...ENV, NOVA_LIFE_ALLOW_UNAUTHENTICATED_LOCAL: '1', NODE_ENV: 'development' },
  });
  await assert.rejects(
    () => cloudConfigured(request(null, '127.0.0.1')),
    (error) => error.code === 'LIFE_AUTH_REQUIRED',
  );
});

test('parallel dashboard requests coalesce Auth verification without caching sessions', async () => {
  let calls = 0;
  let release;
  const authenticate = createLifeAuthenticator({
    env: ENV,
    fetchImpl: async () => {
      calls += 1;
      if (calls > 1) return response(200, { id: 'owner-1' });
      return new Promise((resolve) => { release = resolve; });
    },
  });

  const first = authenticate(request('valid-owner-token'));
  const second = authenticate(request('valid-owner-token'));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls, 1);
  release(response(200, { id: 'owner-1' }));
  assert.deepEqual(await Promise.all([first, second]), [{ id: 'owner-1' }, { id: 'owner-1' }]);

  await authenticate(request('valid-owner-token'));
  assert.equal(calls, 2, 'completed verifications are not cached after an auth change/revocation');
});
