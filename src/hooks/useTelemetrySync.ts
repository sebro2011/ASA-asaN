import { useState, useEffect, useCallback } from 'react';
import { useOnlineStatus } from './useOnlineStatus';

export interface SyncStatus {
  isOnline: boolean;
  isSyncing: boolean;
  pendingCount: number;
  lastSyncedTime: string | null;
  syncSuccessMessage: string | null;
  triggerManualSync: () => void;
}

/**
 * useTelemetrySync Hook
 * Manages two-way communication between the React app and the Service Worker's
 * Background Sync Manager for offline NASA telemetry queuing and re-syncing.
 */
export function useTelemetrySync(): SyncStatus {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);
  const [syncSuccessMessage, setSyncSuccessMessage] = useState<string | null>(null);

  // Trigger manual or automatic background re-sync
  const triggerManualSync = useCallback(() => {
    if (typeof window === 'undefined' || !navigator.serviceWorker) return;

    setIsSyncing(true);

    if (navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SYNC_TELEMETRY_NOW' });
    }

    // Try standard Background Sync API registration
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then((reg: any) => {
        if ('sync' in reg) {
          reg.sync.register('sync-nasa-telemetry').catch(() => {});
        }
      }).catch(() => {});
    }
  }, []);

  // Request current queue status on mount and on worker activation
  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data) return;

      if (data.type === 'SYNC_QUEUE_STATUS') {
        setPendingCount(data.pendingCount || 0);
      } else if (data.type === 'SYNC_STARTED') {
        setIsSyncing(true);
        setPendingCount(data.pendingCount || 0);
        setSyncSuccessMessage(null);
      } else if (data.type === 'SYNC_COMPLETED') {
        setIsSyncing(false);
        setPendingCount(data.remainingCount || 0);
        if (data.timestamp) {
          setLastSyncedTime(data.timestamp);
        }
        if (data.syncedCount > 0) {
          setSyncSuccessMessage(`Synchronized ${data.syncedCount} telemetry feed${data.syncedCount > 1 ? 's' : ''}`);
          // Clear success toast after 4.5 seconds
          setTimeout(() => {
            setSyncSuccessMessage(null);
          }, 4500);
        }
      }
    };

    navigator.serviceWorker.addEventListener('message', handleMessage);

    // Initial query
    navigator.serviceWorker.ready.then((reg) => {
      if (reg.active) {
        reg.active.postMessage({ type: 'GET_SYNC_QUEUE_STATUS' });
      }
    }).catch(() => {});

    return () => {
      navigator.serviceWorker.removeEventListener('message', handleMessage);
    };
  }, []);

  // When device transitions from offline to online, auto-trigger background sync
  useEffect(() => {
    if (isOnline) {
      triggerManualSync();
    }
  }, [isOnline, triggerManualSync]);

  return {
    isOnline,
    isSyncing,
    pendingCount,
    lastSyncedTime,
    syncSuccessMessage,
    triggerManualSync
  };
}

export default useTelemetrySync;
