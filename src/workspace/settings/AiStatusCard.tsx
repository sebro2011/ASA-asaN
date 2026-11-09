/**
 * AI provider status (Phase 3C follow-up).
 *
 * "The AI APIs do not work" is not a diagnosis. This card asks the server one
 * question per provider — can you reach it right now, and if not, what did it
 * say? — and prints the answer. The server performs a single one-token request
 * and redacts every credential before replying, so nothing secret reaches the
 * browser.
 *
 * It is read-only on purpose: it never changes a key or a model, it only tells
 * the truth about the deployment you are looking at.
 */
import { displayModelName } from '../../lib/modelLabels';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Brain, CheckCircle2, CircleSlash, RefreshCw, TriangleAlert } from 'lucide-react';
import { useProviderConfig } from '../useProviderConfig';
import { THINKING_ORDER, thinkingMeta } from '../chat/thinking';

type ProviderKey = 'local' | 'openrouter' | 'gemini' | 'arena';

interface ProviderReport {
  provider: string;
  configured: boolean;
  endpoint: string;
  model: string;
  status: 'ok' | 'error' | 'configured' | 'not-configured';
  code: string;
  httpStatus?: number;
  ms?: number;
  reason?: string;
  /** Only present after a metadata key check ran (a generation probe timed out). */
  keyValid?: boolean | null;
  keyCheck?: { request: string; httpStatus: number; ms: number; code: string; reason?: string };
  /** The provider does own this model id; the configured id does not exist. */
  modelInvalid?: boolean;
  /** What the probe got when it retried with the default model id. */
  fallbackModel?: { model: string; ok: boolean; httpStatus?: number; code: string; ms?: number };
  hint?: string;
}

interface DiagnosticsReport {
  checkedAt: string;
  deployment: string;
  probed: boolean;
  throttled: boolean;
  providers: Record<ProviderKey, ProviderReport>;
}

const ORDER: ProviderKey[] = ['openrouter', 'gemini', 'arena', 'local'];

function StatusIcon({ status }: { status: ProviderReport['status'] }) {
  if (status === 'ok') {
    return <CheckCircle2 size={14} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--color-ws-success)' }} />;
  }
  if (status === 'error') {
    return <TriangleAlert size={14} strokeWidth={2} aria-hidden="true" style={{ color: 'var(--color-ws-warn)' }} />;
  }
  return <CircleSlash size={14} strokeWidth={2} aria-hidden="true" className="text-ws-text-3" />;
}

export default function AiStatusCard() {
  const { t } = useTranslation();
  const [report, setReport] = useState<DiagnosticsReport | null>(null);
  const [state, setState] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const { thinking: catalogue } = useProviderConfig();
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const check = useCallback(async () => {
    setState('loading');
    try {
      const response = await fetch('/api/nova/diagnostics?probe=1', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
      });
      if (!response.ok) throw new Error(`status ${response.status}`);
      const payload = (await response.json()) as DiagnosticsReport;
      if (!mounted.current) return;
      setReport(payload);
      setState('ready');
    } catch {
      if (!mounted.current) return;
      setState('error');
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  const labelFor = (status: ProviderReport['status']): string => {
    switch (status) {
      case 'ok':
        return t('wsAiProbeOk');
      case 'error':
        return t('wsAiProbeError');
      case 'configured':
        return t('wsAiProbeConfigured');
      default:
        return t('wsAiProbeNotConfigured');
    }
  };

  return (
    <section aria-labelledby="nova-settings-ai-status" className="nova-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="nova-settings-ai-status" className="text-[12.5px] font-medium text-ws-text">
            {t('wsAiStatusTitle')}
          </h2>
          <p className="mt-1 max-w-prose text-[11.5px] leading-relaxed text-ws-text-3">{t('wsAiProbeIntro')}</p>
        </div>
        <button
          type="button"
          onClick={() => void check()}
          disabled={state === 'loading'}
          className="flex shrink-0 items-center gap-1.5 rounded-md border px-2.5 py-1 text-[11.5px] text-ws-text transition-colors disabled:opacity-60"
          style={{ borderColor: 'var(--color-ws-border)' }}
        >
          <RefreshCw
            size={12}
            strokeWidth={2}
            aria-hidden="true"
            className={state === 'loading' ? 'animate-spin' : undefined}
          />
          {state === 'loading' ? t('wsAiProbeChecking') : t('wsAiProbeRecheck')}
        </button>
      </div>

      <p role="status" aria-live="polite" className="sr-only">
        {state === 'loading' ? t('wsAiProbeChecking') : state === 'error' ? t('wsAiProbeFailed') : ''}
      </p>

      {state === 'error' ? (
        <p className="mt-3 text-[11.5px] text-ws-warn" role="alert">
          {t('wsAiProbeFailed')}
        </p>
      ) : null}

      {report ? (
        <ul className="mt-3 flex flex-col divide-y" style={{ borderColor: 'var(--color-ws-border)' }}>
          {ORDER.map((key) => {
            const entry = report.providers[key];
            if (!entry) return null;
            const detail =
              entry.status === 'ok'
                ? `${entry.endpoint}${displayModelName(entry.model) ? ` · ${displayModelName(entry.model)}` : ''}${typeof entry.ms === 'number' ? ` · ${entry.ms} ms` : ''}`
                : entry.status === 'error'
                  ? `${entry.code}${entry.httpStatus ? ` (HTTP ${entry.httpStatus})` : ''} · ${entry.endpoint}`
                  : entry.status === 'configured'
                    ? `${entry.endpoint}${displayModelName(entry.model) ? ` · ${displayModelName(entry.model)}` : ''}`
                    : t('wsAiProbeNotConfiguredDetail');

            return (
              <li key={key} className="flex items-start gap-2.5 py-2">
                <span className="mt-0.5 shrink-0">
                  <StatusIcon status={entry.status} />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-[12px] font-medium text-ws-text">{entry.provider}</span>
                    <span className="text-[11px] text-ws-text-3">{labelFor(entry.status)}</span>
                  </div>
                  <p className="mt-0.5 break-words text-[11px] text-ws-text-3">{detail}</p>
                  {typeof entry.keyValid === 'boolean' ? (
                    <p
                      className={`mt-0.5 text-[11px] ${entry.keyValid ? 'text-ws-text-3' : 'text-ws-warn'}`}
                      data-testid={`ai-status-key-${key}`}
                    >
                      {entry.keyValid ? t('wsAiKeyValid') : t('wsAiKeyRejected')}
                    </p>
                  ) : null}
                  {entry.modelInvalid ? (
                    <p className="mt-0.5 break-words text-[11px] text-ws-warn" data-testid={`ai-status-model-${key}`}>
                      {t('wsAiModelInvalid')}
                      {entry.fallbackModel?.ok ? ` ${t('wsAiModelFallbackWorking')}` : ''}
                    </p>
                  ) : null}
                  {entry.reason ? (
                    <p className="mt-0.5 break-words text-[11px] text-ws-text-2" data-testid={`ai-status-reason-${key}`}>
                      {entry.reason}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      ) : null}

      {report ? (
        <p className="mt-2 text-[10.5px] text-ws-text-3">
          {t('wsAiProbeCheckedAt')} {new Date(report.checkedAt).toLocaleTimeString()} · {report.deployment}
        </p>
      ) : null}

      {/* The ordered thinking ladder is part of the deployment's capability, so
          it is reported here next to the provider probes — not buried in chat. */}
      <div className="mt-3 rounded-lg border border-ws-line p-2.5">
        <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-ws-text">
          <Brain size={13} strokeWidth={1.9} aria-hidden="true" className="text-ws-accent-ink" />
          {t('wsThinkingLadderTitle')}
        </p>
        <p className="mt-1 text-[10.5px] leading-relaxed text-ws-text-3">{t('wsThinkingLadderBody')}</p>
        <ul className="mt-2 grid list-none grid-cols-1 gap-1 p-0 sm:grid-cols-2">
          {THINKING_ORDER.map((level) => {
            const entry = catalogue?.levels.find((item) => item.id === level);
            const available = entry ? entry.available : true;
            const effort = entry?.effort ? entry.effort.toUpperCase() : '—';
            return (
              <li key={level} className="flex items-center justify-between gap-2 text-[11px]">
                <span className="text-ws-text-2">{t(thinkingMeta(level).labelKey)}</span>
                <span className="font-mono text-[9.5px] uppercase tracking-[0.08em] text-ws-text-3">
                  {effort} · {available ? t('wsOn') : t('wsOff')}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
