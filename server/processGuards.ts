/**
 * Process-level failure handling.
 *
 * The server used to log `uncaughtException` and carry on serving. After an
 * uncaught throw, nothing about the process state is trustworthy: a half-written
 * map, a socket left in the middle of a frame, a cache mid-eviction. Continuing
 * turns one crash into an unbounded series of possibly-wrong responses, and the
 * platform never gets the signal to replace the instance.
 *
 * The policy is therefore: log it once, flush, exit non-zero, let the supervisor
 * restart. An unhandled *rejection* is still only logged — a rejected promise
 * usually leaves the process coherent, and crashing there would turn a single
 * bad await into an outage. That difference is deliberate, not an oversight.
 *
 * `createFatalErrorHandler` takes its `exit` and `log` so the policy can be
 * tested without killing the test runner.
 */

export interface ProcessGuardOptions {
  log?: (...args: unknown[]) => void;
  /** Called instead of the real `process.exit` in tests. */
  exit?: (code: number) => void;
}

export interface ProcessGuards {
  onUncaughtException: (error: unknown) => void;
  onUnhandledRejection: (reason: unknown, promise?: unknown) => void;
  /** True once a fatal error has been handled — the process is on its way out. */
  readonly fatal: boolean;
}

export function createFatalErrorHandler({ log = console.error, exit = (code: number) => process.exit(code) }: ProcessGuardOptions = {}): ProcessGuards {
  let fatal = false;

  return {
    get fatal() {
      return fatal;
    },

    onUncaughtException(error) {
      if (fatal) return; // one report, not a storm of identical ones
      fatal = true;
      log(
        '[Process] Uncaught exception — process state can no longer be trusted. ' +
          'Exiting so the platform restarts a clean instance.',
        error,
      );
      // Exit on the next tick so the log line reaches stderr before the process
      // goes away; exiting synchronously can truncate it.
      setTimeout(() => exit(1), 0);
    },

    onUnhandledRejection(reason, promise) {
      // Not fatal by policy: report it with enough context to fix the await.
      log('[Process] Unhandled rejection:', reason, 'at:', promise);
    },
  };
}
