/**
 * Sync status, shown in the top bar.
 *
 * It reports only what the engine knows: pending count, offline state, conflicts.
 * Nothing is animated to imply activity; when it says "all changes saved" the
 * queue really is empty.
 */
import { useTranslation } from 'react-i18next';
import { CloudOff, RefreshCw, TriangleAlert } from 'lucide-react';
import { useOptionalAuth } from './AuthProvider';

export default function SyncBadge({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const auth = useOptionalAuth();
  if (!auth || auth.status !== 'signed-in') return null;
  const { sync, syncNow } = auth;

  const offline = sync.status === 'offline';
  const error = sync.status === 'error';
  const busy = sync.status === 'syncing';

  const label = offline
    ? t('wsSyncOffline')
    : error
      ? t('wsSyncAttention')
      : busy
        ? t('wsSyncSyncing')
        : sync.pending > 0
          ? t('wsSyncPending', { count: sync.pending })
          : t('wsSyncUpToDate');

  const Icon = offline ? CloudOff : error ? TriangleAlert : RefreshCw;

  const lastSynced = sync.lastSyncedAt
    ? new Intl.DateTimeFormat(i18n.language || 'en', {
        hour: '2-digit',
        minute: '2-digit',
      }).format(new Date(sync.lastSyncedAt))
    : t('wsSyncNever');

  return (
    <button
      type="button"
      onClick={() => void syncNow()}
      className="nova-chip"
      title={`${t('wsSyncLastSynced')}: ${lastSynced}`}
      aria-label={`${label}. ${t('wsSyncLastSynced')}: ${lastSynced}`}
      style={{ color: error || offline ? 'var(--color-ws-danger)' : 'var(--color-ws-text-2)' }}
    >
      <Icon
        size={11}
        strokeWidth={2}
        aria-hidden="true"
        className={busy ? 'animate-spin' : undefined}
      />
      {compact ? null : <span className="hidden sm:inline">{label}</span>}
      {compact && sync.pending > 0 ? <span>{sync.pending}</span> : null}
    </button>
  );
}
