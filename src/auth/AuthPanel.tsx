/**
 * Sign-in / sign-up / reset panel.
 *
 * One component, four modes, no hidden magic:
 *   unconfigured → a disabled panel that explains why (never a fake form);
 *   sign-up with confirmation required → an explicit "check your inbox" state
 *   with a resend action;
 *   every failure is a translated sentence mapped from a typed error code.
 */
import { useCallback, useEffect, useId, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertCircle, CheckCircle2, Loader2, LogIn, MailCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { useAuth } from './AuthProvider';
import { cloudConfigReasonText } from '../data/config';
import type { AuthErrorCode } from '../data/authApi';

type Mode = 'sign-in' | 'sign-up' | 'reset' | 'check-inbox';

const ERROR_KEYS: Record<AuthErrorCode, string> = {
  'invalid-credentials': 'wsAuthErrCredentials',
  'email-not-confirmed': 'wsAuthErrEmailNotConfirmed',
  'email-taken': 'wsAuthErrEmailTaken',
  'weak-password': 'wsAuthErrWeakPassword',
  'rate-limited': 'wsAuthErrRateLimited',
  'invalid-email': 'wsAuthErrInvalidEmail',
  'same-password': 'wsAuthErrWeakPassword',
  'session-missing': 'wsAuthErrSession',
  network: 'wsAuthErrNetwork',
  unknown: 'wsAuthErrUnknown',
};

export interface AuthPanelProps {
  initialMode?: Extract<Mode, 'sign-in' | 'sign-up'>;
  /** Called after a successful sign-in, or after sign-up when no confirmation is pending. */
  onAuthenticated?: () => void;
  /** Rendered above the form, e.g. "sign in to open Profile". */
  notice?: string;
}

export function errorKey(code: AuthErrorCode): string {
  return ERROR_KEYS[code] ?? 'wsAuthErrUnknown';
}

export default function AuthPanel({ initialMode = 'sign-in', onAuthenticated, notice }: AuthPanelProps) {
  const { t } = useTranslation();
  const auth = useAuth();
  const fieldId = useId();

  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [errorCode, setErrorCode] = useState<AuthErrorCode | null>(null);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  // Email confirmation arrives as a session from the URL; close the panel then.
  useEffect(() => {
    if (auth.status === 'signed-in') onAuthenticated?.();
  }, [auth.status, onAuthenticated]);

  const reset = useCallback(() => {
    setPassword('');
    setConfirm('');
    setErrorCode(null);
    setStatusMessage(null);
  }, []);

  const switchMode = useCallback(
    (next: Mode) => {
      reset();
      setMode(next);
    },
    [reset],
  );

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (busy) return;
    setErrorCode(null);
    setStatusMessage(null);

    if (mode === 'reset') {
      setBusy(true);
      const result = await auth.resetPassword(email);
      setBusy(false);
      if (result.ok) setStatusMessage(t('wsAuthResetSent'));
      else setErrorCode(result.code);
      return;
    }

    if (mode === 'sign-up' && password !== confirm) {
      setErrorCode('weak-password');
      return;
    }

    setBusy(true);
    if (mode === 'sign-in') {
      const result = await auth.signIn(email, password);
      setBusy(false);
      if (result.ok) {
        onAuthenticated?.();
      } else {
        setErrorCode(result.code);
      }
      return;
    }

    const result = await auth.signUp(email, password);
    setBusy(false);
    if (!result.ok) {
      setErrorCode(result.code);
      return;
    }
    if (result.value?.needsConfirmation) {
      setMode('check-inbox');
      return;
    }
    onAuthenticated?.();
  };

  /* --------------------------------------------------------- unconfigured */

  if (auth.status === 'unconfigured') {
    // A probe that never reached the server is retryable; missing credentials are
    // not — those need an operator, and the panel says so instead of guessing.
    const retryable = auth.reason === 'unreachable' || auth.reason === 'invalid-response';
    return (
      <section
        className="nova-glass-strong rounded-[22px] p-5 shadow-[var(--ws-shadow-2)] sm:p-6"
        aria-labelledby={`${fieldId}-unavailable`}
      >
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-10 w-10 shrink-0 place-items-center rounded-full border border-ws-line bg-ws-elev-2 text-ws-accent-ink">
            <ShieldAlert size={18} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={`${fieldId}-unavailable`} className="text-[15px] font-semibold text-ws-text">
              {t('wsAuthUnavailable')}
            </h2>
            <p className="mt-1.5 text-[13px] leading-relaxed text-ws-text-2">
              {t('wsAuthUnavailableBody')}
            </p>
            {auth.reason ? (
              <p className="mt-2.5 flex items-center gap-2 text-[11.5px] text-ws-text-2">
                <span className="nova-dot shrink-0" aria-hidden="true" style={{ background: 'var(--color-ws-warn)' }} />
                {cloudConfigReasonText(auth.reason)}
              </p>
            ) : null}
          </div>
        </div>

        {retryable ? (
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              type="button"
              className="nova-btn nova-btn--primary"
              onClick={() => void auth.retryConnection()}
            >
              <RefreshCw size={13} strokeWidth={2.1} aria-hidden="true" />
              {t('wsAuthRetry')}
            </button>
            <span className="text-[11.5px] text-ws-text-3">{t('wsAuthRetryHint')}</span>
          </div>
        ) : (
          <p className="mt-4 rounded-xl border border-ws-line bg-ws-elev-2 px-3 py-2 font-mono text-[10.5px] leading-relaxed tracking-[0.06em] text-ws-text-3">
            SUPABASE_URL · SUPABASE_PUBLISHABLE_KEY
          </p>
        )}

        <p className="mt-3 text-[11.5px] leading-relaxed text-ws-text-3">
          {t('wsAuthUnavailableHint')}
        </p>
      </section>
    );
  }

  /* ------------------------------------------------------------ inbox wait */

  if (mode === 'check-inbox') {
    return (
      <section className="nova-card p-5 sm:p-6" aria-labelledby={`${fieldId}-inbox`}>
        <div className="flex items-start gap-3">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full border border-ws-line bg-ws-elev text-ws-accent-ink">
            <MailCheck size={17} strokeWidth={1.9} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 id={`${fieldId}-inbox`} className="text-[15px] font-semibold text-ws-text">
              {t('wsAuthCheckInbox')}
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ws-text-2">
              {t('wsAuthCheckInboxBody', { email })}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                type="button"
                className="nova-btn nova-btn--secondary"
                onClick={async () => {
                  setBusy(true);
                  const result = await auth.resendVerification(email);
                  setBusy(false);
                  if (result.ok) setStatusMessage(t('wsAuthResent'));
                  else setErrorCode(result.code);
                }}
                disabled={busy}
              >
                {busy ? <Loader2 size={14} className="animate-spin" aria-hidden="true" /> : null}
                {t('wsAuthResend')}
              </button>
              <button
                type="button"
                className="nova-btn nova-btn--ghost"
                onClick={() => switchMode('sign-in')}
              >
                {t('wsAuthBackToSignIn')}
              </button>
            </div>
            {statusMessage ? (
              <p className="mt-3 flex items-center gap-1.5 text-[12.5px] text-ws-text-2" role="status">
                <CheckCircle2 size={14} className="text-ws-success" aria-hidden="true" />
                {statusMessage}
              </p>
            ) : null}
            {errorCode ? (
              <p className="nova-error mt-3" role="alert">
                <AlertCircle size={14} aria-hidden="true" />
                {t(errorKey(errorCode))}
              </p>
            ) : null}
          </div>
        </div>
      </section>
    );
  }

  /* ------------------------------------------------------------------ form */

  const title = mode === 'sign-up' ? t('wsAuthSignUp') : mode === 'reset' ? t('wsAuthResetTitle') : t('wsAuthTitle');
  const submitLabel =
    mode === 'sign-up' ? t('wsAuthSignUp') : mode === 'reset' ? t('wsAuthSendReset') : t('wsAuthSignIn');

  return (
    <section className="nova-card p-5 sm:p-6" aria-labelledby={`${fieldId}-title`}>
      <h2 id={`${fieldId}-title`} className="text-[16px] font-semibold text-ws-text">
        {title}
      </h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ws-text-2">
        {mode === 'reset' ? t('wsAuthResetSent') : t('wsAuthSubtitle')}
      </p>
      {notice ? (
        <p className="nova-chip mt-3 inline-flex" role="status">
          {notice}
        </p>
      ) : null}

      <form className="mt-4 flex flex-col gap-3.5" onSubmit={submit} noValidate>
        <div className="nova-field">
          <label className="nova-label" htmlFor={`${fieldId}-email`}>
            {t('wsAuthEmail')}
          </label>
          <input
            id={`${fieldId}-email`}
            className="nova-input"
            type="email"
            name="email"
            inputMode="email"
            autoComplete="email"
            required
            dir="ltr"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            aria-invalid={errorCode === 'invalid-email' ? 'true' : undefined}
            aria-describedby={`${fieldId}-email-hint`}
          />
          <span id={`${fieldId}-email-hint`} className="nova-hint">
            name@example.com
          </span>
        </div>

        {mode !== 'reset' ? (
          <div className="nova-field">
            <label className="nova-label" htmlFor={`${fieldId}-password`}>
              {t('wsAuthPassword')}
            </label>
            <input
              id={`${fieldId}-password`}
              className="nova-input"
              type="password"
              name="password"
              autoComplete={mode === 'sign-up' ? 'new-password' : 'current-password'}
              required
              minLength={8}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              aria-invalid={errorCode === 'weak-password' ? 'true' : undefined}
              aria-describedby={`${fieldId}-password-hint`}
            />
            <span id={`${fieldId}-password-hint`} className="nova-hint">
              {t('wsAuthPasswordHint')}
            </span>
          </div>
        ) : null}

        {mode === 'sign-up' ? (
          <div className="nova-field">
            <label className="nova-label" htmlFor={`${fieldId}-confirm`}>
              {t('wsAuthConfirmPassword')}
            </label>
            <input
              id={`${fieldId}-confirm`}
              className="nova-input"
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              required
              minLength={8}
              value={confirm}
              onChange={(event) => setConfirm(event.target.value)}
            />
          </div>
        ) : null}

        {errorCode ? (
          <p className="nova-error" role="alert">
            <AlertCircle size={14} aria-hidden="true" />
            {t(errorKey(errorCode))}
          </p>
        ) : null}

        {statusMessage ? (
          <p className="flex items-center gap-1.5 text-[12.5px] text-ws-text-2" role="status">
            <CheckCircle2 size={14} className="text-ws-success" aria-hidden="true" />
            {statusMessage}
          </p>
        ) : null}

        <button type="submit" className="nova-btn nova-btn--primary justify-center" disabled={busy}>
          {busy ? (
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
          ) : (
            <LogIn size={14} aria-hidden="true" />
          )}
          {busy ? t('wsAuthWorking') : submitLabel}
        </button>
      </form>

      <hr className="nova-divider my-4" />

      <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px]">
        {mode === 'sign-in' ? (
          <>
            <button type="button" className="nova-link bg-transparent" onClick={() => switchMode('reset')}>
              {t('wsAuthForgot')}
            </button>
            <span className="text-ws-text-2">
              {t('wsAuthNoAccount')}{' '}
              <button type="button" className="nova-link bg-transparent" onClick={() => switchMode('sign-up')}>
                {t('wsAuthSignUp')}
              </button>
            </span>
          </>
        ) : (
          <span className="text-ws-text-2">
            {mode === 'reset' ? null : `${t('wsAuthHaveAccount')} `}
            <button type="button" className="nova-link bg-transparent" onClick={() => switchMode('sign-in')}>
              {mode === 'reset' ? t('wsAuthBackToSignIn') : t('wsAuthSignIn')}
            </button>
          </span>
        )}
      </div>
    </section>
  );
}
