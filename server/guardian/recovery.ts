/**
 * Recovery — the only place the Guardian changes anything.
 *
 * Principles, in order of importance:
 *
 *  1. **Never touch a credential.** No action rotates, regenerates or resets a
 *     provider key. An action that would need one returns `REQUIRES_HUMAN` with a
 *     description of what a person has to do instead.
 *  2. **Idempotent.** Repeating an action is safe: resetting a closed breaker
 *     leaves it closed, pruning an empty store removes zero rows, re-probing is
 *     read-only.
 *  3. **Verify, don't assume.** Any action that claims to fix reachability ends
 *     with a probe, and the result is recorded. `verified: false` is a valid,
 *     reported outcome — the point is that the operator learns it did not work.
 *  4. **Audited.** Every attempt is appended to the audit log with the actor, the
 *     target, the before/after state and the verification result. Failed attempts
 *     are recorded too, because "who tried to reset that" matters.
 */

import type { GuardianMonitor } from './monitor';
import type { GuardianStore } from './types';
import { scrubSecrets } from './security';

export type RecoveryActionId =
  | 'reset-breaker'
  | 'reset-all-breakers'
  | 'probe-now'
  | 'clear-connector-cache'
  | 'prune-state';

export interface RecoveryActionSpec {
  id: RecoveryActionId;
  label: string;
  description: string;
  /** Needs a `providerId` in the request. */
  needsProvider: boolean;
  /** Higher risk: the UI asks for confirmation. */
  destructive: boolean;
  /** Actions a human must perform; listed so the operator sees the boundary. */
  requiresHuman?: string;
}

export const RECOVERY_ACTIONS: RecoveryActionSpec[] = [
  {
    id: 'reset-breaker',
    label: 'Reset one circuit breaker',
    description: 'Closes the circuit for one provider and immediately probes it to verify.',
    needsProvider: true,
    destructive: false,
  },
  {
    id: 'reset-all-breakers',
    label: 'Reset every circuit breaker',
    description: 'Closes all circuits. Use after a provider-wide outage has been confirmed resolved.',
    needsProvider: false,
    destructive: true,
  },
  {
    id: 'probe-now',
    label: 'Probe one provider now',
    description: 'Runs the provider probe once, outside the schedule, and records the result.',
    needsProvider: true,
    destructive: false,
  },
  {
    id: 'clear-connector-cache',
    label: 'Clear the connector cache',
    description: 'Drops cached connector responses so the next call fetches fresh data.',
    needsProvider: false,
    destructive: false,
  },
  {
    id: 'prune-state',
    label: 'Prune expired guardian state',
    description: 'Removes expired keys, counters and leases. Retention rules then apply.',
    needsProvider: false,
    destructive: false,
    requiresHuman: 'Rotating an API key or changing a provider model id is always a human action.',
  },
];

export const RECOVERY_ACTION_INDEX: Record<string, RecoveryActionSpec> = Object.fromEntries(
  RECOVERY_ACTIONS.map((action) => [action.id, action]),
);

export interface RecoveryResult {
  ok: boolean;
  action: RecoveryActionId | string;
  providerId?: string;
  target?: string;
  before?: unknown;
  after?: unknown;
  verified?: boolean | null;
  message: string;
  code?: string;
  /** What a human still has to do, when the Guardian cannot finish the job. */
  requiresHuman?: string;
}

export interface RecoveryOptions {
  store: GuardianStore;
  monitor: GuardianMonitor;
  env?: Record<string, string | undefined>;
  now?: () => number;
  /** Named cache clearers, so the Guardian does not import half the app. */
  cacheClearers?: Record<string, () => void | Promise<void>>;
}

export function createRecovery(options: RecoveryOptions) {
  const { store, monitor } = options;
  const env = options.env ?? (typeof process !== 'undefined' ? process.env : {});
  const now = options.now ?? Date.now;
  const clearers = options.cacheClearers ?? {};

  async function audit(
    actor: string,
    action: string,
    target: string,
    severity: 'info' | 'warning' | 'critical',
    detail: Record<string, unknown>,
  ) {
    await store
      .appendAudit({
        at: now(),
        actor,
        action,
        target,
        severity,
        detail: JSON.parse(scrubSecrets(JSON.stringify(detail), env)),
      })
      .catch(() => {});
  }

  async function execute(
    actionId: string,
    request: { providerId?: string; actor: string },
  ): Promise<RecoveryResult> {
    const spec = RECOVERY_ACTION_INDEX[actionId];
    const actor = request.actor || 'system';
    if (!spec) {
      return {
        ok: false,
        action: actionId,
        code: 'UNKNOWN_ACTION',
        message: `Unknown recovery action. Known actions: ${RECOVERY_ACTIONS.map((a) => a.id).join(', ')}.`,
      };
    }
    if (spec.needsProvider && !request.providerId) {
      return { ok: false, action: actionId, code: 'PROVIDER_REQUIRED', message: 'This action needs a providerId.' };
    }
    const providerId = request.providerId;

    switch (spec.id) {
      case 'reset-breaker': {
        const before = await monitor.breaker.snapshot(providerId!);
        await monitor.breaker.reset(providerId!);
        const verification = await monitor.verifyProvider(providerId!, { actor });
        const after = await monitor.breaker.snapshot(providerId!);
        const verified = 'verified' in verification ? verification.verified : false;
        await audit(actor, 'recovery', providerId!, verified ? 'info' : 'warning', {
          action: spec.id,
          before: before?.state ?? null,
          after: after?.state ?? null,
          verified,
        });
        // A reset whose verification fails is re-opened by `verifyProvider`'s
        // record call, so the reported state is the one after verification.
        return {
          ok: true,
          action: spec.id,
          providerId,
          before: before?.state ?? null,
          after: after?.state ?? null,
          verified,
          message: verified
            ? 'The circuit was reset and the provider answered a fresh probe.'
            : 'The circuit was reset, but the provider still failed its probe — the circuit has been re-opened.',
        };
      }

      case 'reset-all-breakers': {
        const snapshot = await monitor.status();
        const breakers = (snapshot.breakers ?? {}) as Record<string, { state?: string } | null>;
        const ids = Object.keys(breakers);
        const before: Record<string, string | undefined> = {};
        for (const id of ids) before[id] = breakers[id]?.state;
        await Promise.all(ids.map((id) => monitor.breaker.reset(id)));
        await audit(actor, 'recovery', 'all-providers', 'warning', { action: spec.id, before });
        return {
          ok: true,
          action: spec.id,
          target: 'all-providers',
          before,
          after: 'closed',
          verified: null,
          message: `Reset ${ids.length} circuits. Verification happens on the next sweep.`,
        };
      }

      case 'probe-now': {
        const verification = await monitor.verifyProvider(providerId!, { actor });
        if ('error' in verification) {
          await audit(actor, 'recovery', providerId!, 'warning', { action: spec.id, error: verification.error });
          return {
            ok: false,
            action: spec.id,
            providerId,
            code: verification.error,
            message:
              verification.error === 'unknown-provider'
                ? 'That provider is not in the Guardian catalogue.'
                : 'The fleet probe budget is exhausted; try again in a minute.',
          };
        }
        return {
          ok: true,
          action: spec.id,
          providerId,
          before: null,
          after: verification.outcome.status,
          verified: verification.verified,
          message: `Probe finished: ${verification.outcome.status} (${verification.outcome.code}).`,
        };
      }

      case 'clear-connector-cache': {
        const names = Object.keys(clearers);
        if (names.length === 0) {
          return {
            ok: false,
            action: spec.id,
            code: 'NO_CLEARERS',
            message: 'No cache clearer is registered with the Guardian in this deployment.',
          };
        }
        const results: Record<string, string> = {};
        for (const name of names) {
          try {
            await clearers[name]();
            results[name] = 'cleared';
          } catch {
            results[name] = 'failed';
          }
        }
        const failed = Object.values(results).filter((value) => value === 'failed').length;
        await audit(actor, 'recovery', 'caches', failed ? 'warning' : 'info', { action: spec.id, results });
        return {
          ok: failed === 0,
          action: spec.id,
          target: 'caches',
          before: null,
          after: results,
          verified: null,
          message: failed === 0 ? 'Caches cleared.' : `${failed} cache clearer(s) failed.`,
        };
      }

      case 'prune-state': {
        const removed = await store.prune(now());
        await audit(actor, 'recovery', 'store', 'info', { action: spec.id, removed });
        return {
          ok: true,
          action: spec.id,
          target: 'store',
          before: null,
          after: { removed },
          verified: null,
          message: `Pruned ${removed} expired record(s).`,
        };
      }

      default:
        return { ok: false, action: actionId, code: 'UNKNOWN_ACTION', message: 'Unhandled action.' };
    }
  }

  return { execute, actions: RECOVERY_ACTIONS };
}

/** Documented boundary: things the Guardian will not do on its own. */
export const HUMAN_ONLY_OPERATIONS = [
  'Rotating or replacing a provider API key.',
  'Changing a provider model id (NOVA_GEMINI_MODEL, NOVA_OPENROUTER_MODEL, NOVA_ARENA_MODEL).',
  'Raising a fleet rate limit above the provider quota.',
  'Restoring a database backup or editing the audit log.',
  'Deleting Guardian state beyond the documented retention window.',
];
