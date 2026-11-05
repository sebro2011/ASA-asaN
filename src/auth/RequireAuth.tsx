/**
 * Route guard for surfaces that render user-owned data.
 *
 * Never redirects: a redirect loop is worse than an honest panel, and the URL the
 * user asked for stays shareable/refreshable. Three states only — loading,
 * sign-in (or unconfigured), and children.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import { useAuth } from './AuthProvider';
import AuthPanel from './AuthPanel';

export interface RequireAuthProps {
  children: ReactNode;
  notice?: string;
}

export default function RequireAuth({ children, notice }: RequireAuthProps) {
  const { t } = useTranslation();
  const auth = useAuth();

  if (auth.status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6" role="status" aria-live="polite">
        <div className="nova-card flex items-center gap-3 p-5">
          <Loader2 size={16} className="animate-spin text-ws-text-3" aria-hidden="true" />
          <p className="text-[13px] text-ws-text-2">{t('wsAuthLoading')}</p>
        </div>
      </div>
    );
  }

  if (auth.status !== 'signed-in') {
    return (
      <div className="mx-auto w-full max-w-md px-4 py-8 sm:px-6 sm:py-12">
        <AuthPanel notice={notice} />
      </div>
    );
  }

  return <>{children}</>;
}
