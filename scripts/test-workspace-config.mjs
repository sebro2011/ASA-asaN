/**
 * `/api/workspace/config` contract tests (Phase 3B).
 *
 * The endpoint hands the browser a Supabase URL and publishable key. The tests
 * pin the two things that must never regress: the service-role key can never be
 * returned, and a malformed origin is refused instead of partially accepted.
 *
 * Run: node --import tsx --test scripts/test-workspace-config.mjs
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import { isPublishableKey, readWorkspaceCloudConfig } from '../server/workspaceConfig.ts';

// A structurally valid legacy JWT with role "anon" — not a real credential.
const ANON_JWT = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(
  JSON.stringify({ role: 'anon', iss: 'supabase' }),
).toString('base64url')}.signature-not-real`;
const SERVICE_JWT = `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.${Buffer.from(
  JSON.stringify({ role: 'service_role', iss: 'supabase' }),
).toString('base64url')}.signature-not-real`;

test('publishable keys are recognised, secrets and junk are not', () => {
  assert.equal(isPublishableKey('sb_publishable_abcdefghijklmnopqrstuvwx'), true);
  assert.equal(isPublishableKey(ANON_JWT), true, 'legacy anon JWT');
  assert.equal(isPublishableKey('sb_publishable_short'), false);
  assert.equal(isPublishableKey(SERVICE_JWT), false, 'service-role JWT is rejected');
  assert.equal(isPublishableKey('not-a-key'), false);
  assert.equal(isPublishableKey(''), false);
});

test('an unconfigured deployment says so instead of pretending', () => {
  assert.deepEqual(readWorkspaceCloudConfig({}), { enabled: false, reason: 'not-configured' });
  assert.deepEqual(readWorkspaceCloudConfig({ SUPABASE_URL: 'https://x.supabase.co' }), {
    enabled: false,
    reason: 'not-configured',
  });
});

test('only a bare https origin is accepted', () => {
  const key = 'sb_publishable_abcdefghijklmnopqrstuvwx';
  for (const url of [
    'http://project.supabase.co',
    'https://project.supabase.co/rest/v1',
    'https://project.supabase.co:8443',
    'https://user:pass@project.supabase.co',
    'https://project.supabase.co?x=1',
    'not a url',
  ]) {
    assert.deepEqual(
      readWorkspaceCloudConfig({ SUPABASE_URL: url, SUPABASE_PUBLISHABLE_KEY: key }),
      { enabled: false, reason: 'invalid-url' },
      url,
    );
  }
});

test('a secret pasted into the public variable is refused', () => {
  const base = { SUPABASE_URL: 'https://project.supabase.co' };
  assert.deepEqual(
    readWorkspaceCloudConfig({ ...base, SUPABASE_PUBLISHABLE_KEY: SERVICE_JWT }),
    { enabled: false, reason: 'invalid-key' },
  );
  assert.deepEqual(
    readWorkspaceCloudConfig({
      ...base,
      SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwx',
      SUPABASE_SERVICE_ROLE_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwx',
    }),
    { enabled: false, reason: 'key-conflict' },
    'the same value in both variables disables the feature',
  );
});

test('a valid configuration returns the origin and the publishable key only', () => {
  const config = readWorkspaceCloudConfig({
    SUPABASE_URL: 'https://Project.Supabase.co/',
    SUPABASE_PUBLISHABLE_KEY: ANON_JWT,
    SUPABASE_SERVICE_ROLE_KEY: SERVICE_JWT,
  });

  assert.equal(config.enabled, true);
  assert.equal(config.url, 'https://project.supabase.co', 'normalised origin');
  assert.equal(config.publishableKey, ANON_JWT);
  assert.equal(JSON.stringify(config).includes('service_role'), false, 'never the secret');
  assert.deepEqual(Object.keys(config).sort(), ['enabled', 'publishableKey', 'url']);
});

test('the legacy SUPABASE_ANON_KEY name still works as a fallback', () => {
  const config = readWorkspaceCloudConfig({
    SUPABASE_URL: 'https://project.supabase.co',
    SUPABASE_ANON_KEY: 'sb_publishable_abcdefghijklmnopqrstuvwx',
  });
  assert.equal(config.enabled, true);
});
