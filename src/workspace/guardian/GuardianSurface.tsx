/**
 * COSMORA API Guardian — operational dashboard (`/guardian`).
 *
 * Reads `/api/guardian/*`. The read endpoints are credential-free; anything that
 * changes fleet state (sweep, recovery) requires an administrator token, which
 * this surface asks for and keeps **in memory only** — never in localStorage,
 * never in a cookie, never in a URL.
 *
 * The dashboard's job is to be honest, not reassuring:
 *  - an unprobed provider shows "no data", never a green tick;
 *  - the store card says "instance-local" when the deployment has no shared
 *    store, instead of implying fleet-wide protection it does not have;
 *  - a skipped probe is shown with the reason it was skipped;
 *  - a failed verification is displayed as a failure.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  Database,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  Wrench,
  XCircle,
} from 'lucide-react';

type ProbeStatus = 'ok' | 'degraded' | 'down' | 'unconfigured' | 'skipped';

interface GuardianProvider {
  id: string;
  label: string;
  kind: string;
  endpoint: string;
  docsUrl: string | null;
  requiresEnv: string[];
  cost: 'free' | 'metered';
}

interface BreakerSnapshot {
  state: 'closed' | 'open' | 'half-open';
  failures: number;
  degradations: number;
  cooldownUntil: number | null;
  lastCode: string | null;
  lastSuccessAt: number | null;
  lastFailureAt: number | null;
}

interface StatusResponse {
  ok: boolean;
  instanceId: string;
  store: {
    kind: string;
    capabilities: Record<string, boolean>;
    reason: string;
    missing: string[];
    health: { ok: boolean; detail?: string };
    describe: Record<string, unknown>;
  };
  providers: GuardianProvider[];
  breakers: Record<string, BreakerSnapshot | null>;
  lastRun: {
    id: string;
    startedAt: number;
    finishedAt: number | null;
    trigger: string;
    summary: { ok: number; down: number; degraded: number; skipped: number; incident: boolean } | null;
  } | null;
  analytics: {
    windowMs: number;
    samples: number;
    runs: number;
    incidents: number;
    providers: Array<{
      providerId: string;
      availability: number | null;
      p95LatencyMs: number | null;
      lastStatus: ProbeStatus | null;
      lastSeenAt: number | null;
    }>;
  };
  generatedAt: number;
}

interface AuditEntry {
  id: string;
  at: number;
  actor: string;
  action: string;
  target: string;
  severity: 'info' | 'warning' | 'critical';
  detail?: Record<string, unknown>;
}

interface ConfigResponse {
  ok: boolean;
  env: { set: string[]; missing: string[]; total: number };
  store: { kind: string; capabilities: Record<string, boolean>; reason: string; missing: string[] };
  schedule: { endpoint: string; requiresSecret: string; configured: boolean; recommended: string };
  adminConfigured: boolean;
  recoveryActions: Array<{
    id: string;
    label: string;
    description: string;
    needsProvider: boolean;
    destructive: boolean;
  }>;
  humanOnlyOperations: string[];
  deployment: { environment: string; commit: string | null; region: string | null };
}

const jsonHeaders = (token: string): Record<string, string> => ({
  Accept: 'application/json',
  ...(token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : {}),
});

async function readJson<T>(url: string, token = ''): Promise<T> {
  const response = await fetch(url, { headers: jsonHeaders(token) });
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    // Keep the machine code: an operator needs `GUARDIAN_LOCKED` far more than a
    // sentence, and the dashboard prints it verbatim.
    const code = body && typeof body.code === 'string' ? body.code : null;
    const message = (body && body.error) || `HTTP ${response.status}`;
    throw new Error(code ? `${code}: ${message}` : String(message));
  }
  return body as T;
}

const STATUS_TONE: Record<ProbeStatus | 'none', string> = {
  ok: 'gd-chip--ok',
  degraded: 'gd-chip--warn',
  down: 'gd-chip--bad',
  unconfigured: 'gd-chip--muted',
  skipped: 'gd-chip--muted',
  none: 'gd-chip--muted',
};

const formatTime = (value: number | null | undefined, locale: string) =>
  value ? new Date(value).toLocaleString(locale) : '—';

const formatPercent = (value: number | null) => (value === null ? '—' : `${Math.round(value * 100)}%`);

export function GuardianSurface() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language || 'en';

  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [config, setConfig] = useState<ConfigResponse | null>(null);
  const [audit, setAudit] = useState<AuditEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn' | 'bad'; text: string } | null>(null);
  const [recoveryAction, setRecoveryAction] = useState('probe-now');
  const [recoveryProvider, setRecoveryProvider] = useState('');

  /** Admin-only reads are retried whenever the operator supplies a token. */
  const loadAdmin = useCallback(
    async (nextToken: string) => {
      if (!nextToken) {
        setConfig(null);
        setAudit(null);
        return;
      }
      try {
        const [configBody, auditBody] = await Promise.all([
          readJson<ConfigResponse>('/api/guardian/config', nextToken),
          readJson<{ ok: boolean; entries: AuditEntry[] }>('/api/guardian/audit?limit=25', nextToken),
        ]);
        setConfig(configBody);
        setAudit(auditBody.entries);
        setError(null);
      } catch (failure) {
        setConfig(null);
        setAudit(null);
        setError(failure instanceof Error ? failure.message : String(failure));
      }
    },
    [],
  );

  const loadStatus = useCallback(async () => {
    try {
      const body = await readJson<StatusResponse>('/api/guardian/status');
      setStatus(body);
      setError(null);
    } catch (failure) {
      setStatus(null);
      setError(failure instanceof Error ? failure.message : String(failure));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
    // Poll only while the tab is visible: a background tab asking every 30 s is
    // exactly the kind of spend this system exists to prevent.
    const timer = setInterval(() => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      void loadStatus();
    }, 30_000);
    return () => clearInterval(timer);
  }, [loadStatus]);

  useEffect(() => {
    void loadAdmin(token);
  }, [loadAdmin, token]);

  const providers = status?.providers ?? [];
  const analyticsById = useMemo(() => {
    const map = new Map<string, StatusResponse['analytics']['providers'][number]>();
    for (const entry of status?.analytics.providers ?? []) map.set(entry.providerId, entry);
    return map;
  }, [status]);

  /** True before the first successful read — and after a failed one. */
  const unknown = status === null;

  const summary = useMemo(() => {
    const breakers = status?.breakers ?? {};
    const open = Object.values(breakers).filter((breaker) => breaker?.state === 'open').length;
    const halfOpen = Object.values(breakers).filter((breaker) => breaker?.state === 'half-open').length;
    const lastSummary = status?.lastRun?.summary ?? null;
    return {
      open,
      halfOpen,
      down: lastSummary?.down ?? 0,
      degraded: lastSummary?.degraded ?? 0,
      skipped: lastSummary?.skipped ?? 0,
      ok: lastSummary?.ok ?? 0,
      incident: Boolean(lastSummary?.incident),
      caps: status?.store.capabilities ?? {},
    };
  }, [status]);

  async function runSweep(includeMetered: boolean) {
    if (!token) {
      setNotice({ tone: 'warn', text: t('gdTokenRequired') });
      return;
    }
    setBusy('sweep');
    try {
      const body = await fetch('/api/guardian/run', {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({ includeMetered }),
      }).then(async (response) => ({ ok: response.ok, body: await response.json().catch(() => null) }));
      if (!body.ok) throw new Error(body.body?.error || body.body?.code || 'run-failed');
      if (body.body?.ran === false) {
        setNotice({ tone: 'warn', text: `${t('gdSweepSkipped')} ${body.body.reason ?? ''}`.trim() });
      } else {
        const result = body.body?.summary;
        setNotice({
          tone: result?.incident ? 'bad' : 'ok',
          text: `${t('gdSweepDone')} ${result?.ok ?? 0} ok · ${result?.down ?? 0} down · ${result?.skipped ?? 0} skipped`,
        });
      }
      await loadStatus();
      await loadAdmin(token);
    } catch (failure) {
      setNotice({ tone: 'bad', text: failure instanceof Error ? failure.message : String(failure) });
    } finally {
      setBusy(null);
    }
  }

  async function performRecovery() {
    if (!token) {
      setNotice({ tone: 'warn', text: t('gdTokenRequired') });
      return;
    }
    setBusy('recovery');
    try {
      const response = await fetch('/api/guardian/recovery', {
        method: 'POST',
        headers: jsonHeaders(token),
        body: JSON.stringify({ action: recoveryAction, providerId: recoveryProvider || undefined }),
      });
      const body = await response.json().catch(() => null);
      setNotice({
        tone: response.ok && body?.ok ? (body?.verified === false ? 'warn' : 'ok') : 'bad',
        text: String(body?.message ?? body?.error ?? `HTTP ${response.status}`),
      });
      await loadStatus();
      await loadAdmin(token);
    } catch (failure) {
      setNotice({ tone: 'bad', text: failure instanceof Error ? failure.message : String(failure) });
    } finally {
      setBusy(null);
    }
  }

  async function probeNow(providerId: string) {
    if (!token) {
      setNotice({ tone: 'warn', text: t('gdTokenRequired') });
      return;
    }
    setBusy(`probe:${providerId}`);
    try {
      const response = await fetch(`/api/guardian/verify?provider=${encodeURIComponent(providerId)}`, {
        headers: jsonHeaders(token),
      });
      const body = await response.json().catch(() => null);
      setNotice({
        tone: response.ok && body?.verified ? 'ok' : 'warn',
        text: response.ok
          ? `${providerId}: ${body?.outcome?.status ?? '?'} (${body?.outcome?.code ?? '?'})`
          : String(body?.error ?? `HTTP ${response.status}`),
      });
      await loadStatus();
    } catch (failure) {
      setNotice({ tone: 'bad', text: failure instanceof Error ? failure.message : String(failure) });
    } finally {
      setBusy(null);
    }
  }

  const actionNeedsProvider = useMemo(
    () => (config?.recoveryActions ?? []).find((action) => action.id === recoveryAction)?.needsProvider ?? false,
    [config, recoveryAction],
  );

  return (
    <div className="gd-surface">
      <header className="gd-head">
        <div>
          <p className="gd-eyebrow">{t('gdEyebrow')}</p>
          <h1 className="gd-title">
            <ShieldCheck aria-hidden className="gd-title__icon" /> {t('gdTitle')}
          </h1>
          <p className="gd-subtitle">{t('gdSubtitle')}</p>
        </div>
        <div className="gd-head__actions">
          <button type="button" className="gd-btn" onClick={() => void loadStatus()} disabled={busy !== null}>
            <RefreshCw aria-hidden size={14} /> {t('gdRefresh')}
          </button>
          <button
            type="button"
            className="gd-btn gd-btn--primary"
            onClick={() => void runSweep(false)}
            disabled={busy !== null}
          >
            <Activity aria-hidden size={14} /> {t('gdRunCheap')}
          </button>
          <button type="button" className="gd-btn" onClick={() => void runSweep(true)} disabled={busy !== null}>
            <Timer aria-hidden size={14} /> {t('gdRunDeep')}
          </button>
        </div>
      </header>

      <div className="gd-token">
        <label className="gd-token__field">
          <span>{t('gdAdminToken')}</span>
          <input
            type="password"
            value={token}
            autoComplete="off"
            spellCheck={false}
            placeholder={t('gdAdminTokenPlaceholder')}
            onChange={(event) => setToken(event.target.value)}
          />
        </label>
        <p className="gd-token__hint">{t('gdAdminTokenHint')}</p>
      </div>

      <p className="gd-live" role="status" aria-live="polite">
        {notice ? (
          <span className={`gd-notice gd-notice--${notice.tone}`}>
            {notice.tone === 'bad' ? <XCircle aria-hidden size={14} /> : notice.tone === 'warn' ? <AlertTriangle aria-hidden size={14} /> : <CheckCircle2 aria-hidden size={14} />}
            {notice.text}
          </span>
        ) : loading ? (
          t('gdLoading')
        ) : (
          `${t('gdUpdated')} ${formatTime(status?.generatedAt, locale)}`
        )}
      </p>

      {error ? (
        <div className="gd-alert" role="alert">
          <ShieldAlert aria-hidden size={16} />
          <div>
            <strong>{t('gdErrorTitle')}</strong>
            <p>{error}</p>
          </div>
        </div>
      ) : null}

      <section className="gd-grid" aria-label={t('gdHealth')}>
        <article className="gd-card">
          <p className="gd-card__label">{t('gdHealth')}</p>
          <p className={`gd-card__value ${unknown ? '' : summary.incident ? 'is-bad' : 'is-ok'}`}>
            {/* An unreadable guardian has no health status. "Nominal" would be a lie. */}
            {unknown ? t('gdNoData') : summary.incident ? t('gdIncident') : t('gdNominal')}
          </p>
          <p className="gd-card__hint">
            {unknown
              ? t('gdErrorTitle')
              : `${summary.ok} ok · ${summary.degraded} degraded · ${summary.down} down · ${summary.skipped} ${t('gdSkipped')}`}
          </p>
        </article>
        <article className="gd-card">
          <p className="gd-card__label">{t('gdCircuits')}</p>
          <p className={`gd-card__value ${unknown ? '' : summary.open ? 'is-bad' : 'is-ok'}`}>
            {unknown ? '—' : summary.open}
          </p>
          <p className="gd-card__hint">
            {unknown ? t('gdNoData') : `${summary.halfOpen} ${t('gdHalfOpen')} · ${providers.length} ${t('gdWatched')}`}
          </p>
        </article>
        <article className="gd-card">
          <p className="gd-card__label">{t('gdStore')}</p>
          <p className="gd-card__value">
            <Database aria-hidden size={16} /> {status?.store.kind ?? '—'}
          </p>
          <p className="gd-card__hint">
            {summary.caps.distributed ? t('gdDistributed') : t('gdInstanceLocal')} · {status?.store.reason ?? ''}
          </p>
        </article>
        <article className="gd-card">
          <p className="gd-card__label">{t('gdLastRun')}</p>
          <p className="gd-card__value">{status?.lastRun ? formatTime(status.lastRun.startedAt, locale) : t('gdNever')}</p>
          <p className="gd-card__hint">
            {status?.lastRun ? `${status.lastRun.trigger} · ${status.lastRun.id}` : t('gdNoRunYet')}
          </p>
        </article>
      </section>

      <section className="gd-panel" aria-label={t('gdProviders')}>
        <div className="gd-panel__head">
          <h2>{t('gdProviders')}</h2>
          <p>{t('gdProvidersHint')}</p>
        </div>
        <div className="gd-tablewrap">
          <table className="gd-table">
            <caption className="gd-sr">{t('gdProviders')}</caption>
            <thead>
              <tr>
                <th scope="col">{t('gdProvider')}</th>
                <th scope="col">{t('gdKind')}</th>
                <th scope="col">{t('gdCircuit')}</th>
                <th scope="col">{t('gdLastStatus')}</th>
                <th scope="col">{t('gdAvailability')}</th>
                <th scope="col">{t('gdP95')}</th>
                <th scope="col">{t('gdActions')}</th>
              </tr>
            </thead>
            <tbody>
              {providers.map((provider) => {
                const breaker = status?.breakers[provider.id] ?? null;
                const stats = analyticsById.get(provider.id);
                const last = stats?.lastStatus ?? null;
                return (
                  <tr key={provider.id}>
                    <th scope="row">
                      <span className="gd-provider__name">{provider.id}</span>
                      <span className="gd-provider__endpoint">{provider.endpoint}</span>
                      {provider.cost === 'metered' ? <span className="gd-chip gd-chip--muted">{t('gdMetered')}</span> : null}
                    </th>
                    <td>{provider.kind}</td>
                    <td>
                      <span className={`gd-chip ${breaker?.state === 'open' ? 'gd-chip--bad' : breaker?.state === 'half-open' ? 'gd-chip--warn' : 'gd-chip--ok'}`}>
                        {breaker?.state ?? t('gdNever')}
                      </span>
                      {breaker?.lastCode ? <span className="gd-mono gd-muted">{breaker.lastCode}</span> : null}
                    </td>
                    <td>
                      <span className={`gd-chip ${STATUS_TONE[last ?? 'none']}`}>{last ?? t('gdNoData')}</span>
                    </td>
                    <td className="gd-mono">{formatPercent(stats?.availability ?? null)}</td>
                    <td className="gd-mono">{stats?.p95LatencyMs === null || stats?.p95LatencyMs === undefined ? '—' : `${stats.p95LatencyMs} ms`}</td>
                    <td>
                      <div className="gd-rowactions">
                        <button
                          type="button"
                          className="gd-btn gd-btn--tiny"
                          disabled={busy !== null || !token}
                          onClick={() => void probeNow(provider.id)}
                        >
                          {t('gdProbeNow')}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div className="gd-split">
        <section className="gd-panel" aria-label={t('gdRecovery')}>
          <div className="gd-panel__head">
            <h2>
              <Wrench aria-hidden size={16} /> {t('gdRecovery')}
            </h2>
            <p>{t('gdRecoveryHint')}</p>
          </div>
          <div className="gd-form">
            <label>
              <span>{t('gdAction')}</span>
              <select value={recoveryAction} onChange={(event) => setRecoveryAction(event.target.value)} disabled={!config}>
                {(config?.recoveryActions ?? []).map((action) => (
                  <option key={action.id} value={action.id}>
                    {action.label}
                    {action.destructive ? ' ⚠' : ''}
                  </option>
                ))}
                {config ? null : <option value={recoveryAction}>{t('gdTokenRequiredShort')}</option>}
              </select>
            </label>
            <label>
              <span>{t('gdProvider')}</span>
              <select
                value={recoveryProvider}
                onChange={(event) => setRecoveryProvider(event.target.value)}
                disabled={!actionNeedsProvider}
              >
                <option value="">—</option>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.id}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="gd-btn gd-btn--primary" onClick={() => void performRecovery()} disabled={busy !== null || !token}>
              {t('gdRunAction')}
            </button>
          </div>
          <p className="gd-fineprint">{t('gdRecoveryVerify')}</p>
          {config?.humanOnlyOperations?.length ? (
            <details className="gd-details">
              <summary>{t('gdHumanOnly')}</summary>
              <ul>
                {config.humanOnlyOperations.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>

        <section className="gd-panel" aria-label={t('gdAudit')}>
          <div className="gd-panel__head">
            <h2>{t('gdAudit')}</h2>
            <p>{t('gdAuditHint')}</p>
          </div>
          {!token ? (
            <p className="gd-empty">{t('gdAdminRequired')}</p>
          ) : audit === null ? (
            <p className="gd-empty">{t('gdLoading')}</p>
          ) : audit.length === 0 ? (
            <p className="gd-empty">{t('gdNoAudit')}</p>
          ) : (
            <ul className="gd-audit">
              {audit.map((entry) => (
                <li key={entry.id} className={`gd-audit__row gd-audit__row--${entry.severity}`}>
                  <span className="gd-mono gd-muted">{formatTime(entry.at, locale)}</span>
                  <strong>{entry.action}</strong>
                  <span>{entry.target}</span>
                  <span className="gd-muted">{entry.actor}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {config ? (
        <section className="gd-panel" aria-label={t('gdConfig')}>
          <div className="gd-panel__head">
            <h2>{t('gdConfig')}</h2>
            <p>{t('gdConfigHint')}</p>
          </div>
          <div className="gd-config">
            <div>
              <h3>{t('gdSchedule')}</h3>
              <p className="gd-mono">{config.schedule.endpoint}</p>
              <p>{config.schedule.recommended}</p>
              <p>
                <span className={`gd-chip ${config.schedule.configured ? 'gd-chip--ok' : 'gd-chip--warn'}`}>
                  {config.schedule.requiresSecret}: {config.schedule.configured ? t('gdSet') : t('gdMissing')}
                </span>
              </p>
            </div>
            <div>
              <h3>{t('gdEnv')}</h3>
              <p className="gd-fineprint">{config.env.set.length}/{config.env.total} {t('gdSet')}</p>
              <p className="gd-mono gd-muted">{config.env.missing.join(', ') || '—'}</p>
            </div>
            <div>
              <h3>{t('gdDeployment')}</h3>
              <p className="gd-mono">
                {config.deployment.environment}
                {config.deployment.commit ? ` · ${config.deployment.commit}` : ''}
                {config.deployment.region ? ` · ${config.deployment.region}` : ''}
              </p>
            </div>
          </div>
        </section>
      ) : null}
    </div>
  );
}

export default GuardianSurface;
