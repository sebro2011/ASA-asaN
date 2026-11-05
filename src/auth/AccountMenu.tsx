/**
 * Account chip for the top bar.
 *
 * Signed out it is a single "Sign in" link. Signed in it opens a small menu with
 * the account identity, the profile screen and sign-out — nothing else, because
 * nothing else exists yet.
 */
import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LogIn, LogOut, UserRound } from 'lucide-react';
import { Link } from '../app/router';
import { useEscape } from '../app/hooks';
import { useOptionalAuth } from './AuthProvider';

function initials(email: string | null): string {
  if (!email) return 'N';
  const name = email.split('@')[0] || 'N';
  return name.slice(0, 1).toUpperCase();
}

export default function AccountMenu({ compact = false }: { compact?: boolean }) {
  const { t } = useTranslation();
  const auth = useOptionalAuth();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  const close = useCallback(() => setOpen(false), []);
  useEscape(open, close);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointerDown);
    return () => document.removeEventListener('pointerdown', onPointerDown);
  }, [close, open]);

  // Move focus into the menu when it opens, back to the chip when it closes.
  useEffect(() => {
    if (open) {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    } else {
      buttonRef.current?.focus({ preventScroll: true });
    }
  }, [open]);

  if (!auth || auth.status === 'unconfigured' || auth.status === 'loading') {
    // No account affordance without a cloud: a disabled chip would be noise.
    return null;
  }

  if (auth.status !== 'signed-in' || !auth.user) {
    return (
      <Link
        to="/profile"
        className="nova-btn nova-btn--secondary"
        style={{ height: '2rem', paddingInline: compact ? '0.5rem' : '0.625rem' }}
      >
        <LogIn size={14} strokeWidth={1.9} aria-hidden="true" />
        {compact ? null : <span className="text-[12px]">{t('wsAuthSignIn')}</span>}
        {compact ? <span className="sr-only">{t('wsAuthSignIn')}</span> : null}
      </Link>
    );
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        ref={buttonRef}
        type="button"
        className="nova-icon-btn"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${t('wsAccount')} — ${auth.user.email ?? ''}`}
        onClick={() => setOpen((value) => !value)}
      >
        <span
          className="grid h-6 w-6 place-items-center rounded-full text-[11px] font-semibold"
          style={{
            background: 'color-mix(in srgb, var(--color-ws-accent) 22%, transparent)',
            color: 'var(--color-ws-accent-ink)',
          }}
          aria-hidden="true"
        >
          {initials(auth.user.email)}
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          role="menu"
          aria-label={t('wsAccount')}
          className="absolute right-0 top-[calc(100%+0.375rem)] z-50 w-64 overflow-hidden rounded-xl border border-ws-line bg-ws-surface p-1.5"
          style={{ boxShadow: 'var(--ws-shadow-2)' }}
        >
          <div className="px-2.5 py-2">
            <p className="text-[11px] uppercase tracking-[0.14em] text-ws-text-3">
              {t('wsSignedInAs')}
            </p>
            <p className="mt-0.5 truncate text-[12.5px] text-ws-text" dir="ltr">
              {auth.user.email}
            </p>
          </div>
          <hr className="nova-divider" />
          <Link
            to="/profile"
            role="menuitem"
            className="nova-nav-item"
            onClick={close}
            style={{ height: '2.25rem' }}
          >
            <span className="nova-nav-item__icon">
              <UserRound size={14} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="nova-nav-item__label">{t('wsManageProfile')}</span>
          </Link>
          <button
            type="button"
            role="menuitem"
            className="nova-nav-item w-full"
            onClick={async () => {
              close();
              await auth.signOut();
            }}
            style={{ height: '2.25rem' }}
          >
            <span className="nova-nav-item__icon">
              <LogOut size={14} strokeWidth={1.8} aria-hidden="true" />
            </span>
            <span className="nova-nav-item__label">{t('wsSignOut')}</span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
