/**
 * What happens after an uncaught exception.
 *
 * The server used to log it and keep serving. That turns one crash into an
 * unbounded series of possibly-wrong responses, and never lets the platform
 * replace the instance. The policy is now: log once, flush, exit non-zero.
 *
 * These tests drive the policy through injected `exit`/`log` so the test runner
 * is not the thing being killed.
 *
 * Run: node --import tsx --test --test-force-exit scripts/test-process-guards.mjs
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createFatalErrorHandler } from '../server/processGuards.ts';

test('an uncaught exception is logged once and then exits non-zero', async () => {
  const logs = [];
  const exits = [];
  const guards = createFatalErrorHandler({
    log: (...args) => logs.push(args),
    exit: (code) => exits.push(code),
  });

  assert.equal(guards.fatal, false);
  guards.onUncaughtException(new Error('boom'));
  assert.equal(guards.fatal, true, 'the process is on its way out');

  // The exit is deferred by one tick so the log line reaches stderr first.
  assert.deepEqual(exits, [], 'exit must not happen synchronously');
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(exits, [1], 'exit code 1, so supervisors see a failure');

  assert.equal(logs.length, 1, 'one report, not a storm');
  assert.match(String(logs[0][0]), /state can no longer be trusted/);
  assert.equal(logs[0][1].message, 'boom');
});

test('a second uncaught exception does not log again', async () => {
  const logs = [];
  const exits = [];
  const guards = createFatalErrorHandler({ log: (...args) => logs.push(args), exit: (code) => exits.push(code) });

  guards.onUncaughtException(new Error('first'));
  guards.onUncaughtException(new Error('second'));
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(logs.length, 1, 'a crashing loop must not become a log storm');
  assert.deepEqual(exits, [1], 'and must not try to exit twice');
});

test('an unhandled rejection is reported but does not kill the process', async () => {
  const logs = [];
  const exits = [];
  const guards = createFatalErrorHandler({ log: (...args) => logs.push(args), exit: (code) => exits.push(code) });

  guards.onUnhandledRejection(new Error('rejected'), Promise.resolve());
  await new Promise((resolve) => setTimeout(resolve, 10));

  assert.equal(guards.fatal, false, 'a rejected promise usually leaves state coherent');
  assert.deepEqual(exits, [], 'so it must not take the deployment down');
  assert.equal(logs.length, 1);
  assert.match(String(logs[0][0]), /Unhandled rejection/);
});

test('the server wires both handlers to the shared policy', () => {
  const source = readFileSync('server.ts', 'utf8');
  assert.match(source, /createFatalErrorHandler\(\)/, 'server.ts must build the guard');
  assert.match(source, /process\.on\('uncaughtException', processGuards\.onUncaughtException\)/);
  assert.match(source, /process\.on\('unhandledRejection', processGuards\.onUnhandledRejection\)/);
  // The swallowed version left a console.error and no exit.
  assert.doesNotMatch(source, /process\.on\('uncaughtException', \(err\) => \{\s*console\.error/, 'the old swallow-only handler is back');
});
