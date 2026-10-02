'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, RefreshCw, CheckCircle2, Radio, Database } from 'lucide-react';
import { useTelemetrySync } from '../hooks/useTelemetrySync';

interface OfflineIndicatorProps {
  lang?: string;
}

/**
 * OfflineIndicator Component
 * Real-time reactive indicator reflecting online/offline state, pending queued
 * NASA telemetry requests, background sync in-progress, and successful sync notifications.
 */
export const OfflineIndicator: React.FC<OfflineIndicatorProps> = ({ lang = 'en' }) => {
  const { 
    isOnline, 
    isSyncing, 
    pendingCount, 
    lastSyncedTime, 
    syncSuccessMessage, 
    triggerManualSync 
  } = useTelemetrySync();

  // If online, not syncing, and no recent sync message to display, hide
  const shouldShow = !isOnline || isSyncing || Boolean(syncSuccessMessage);

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: 25, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-24 sm:bottom-6 left-6 z-50 font-sans select-none"
        >
          {/* 1. Offline Mode Active with Queued Request Counter */}
          {!isOnline && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-amber-500/95 border border-amber-300 text-slate-950 shadow-2xl backdrop-blur-xl">
              <div className="relative">
                <WifiOff className="w-5 h-5 text-slate-950" />
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-rose-600 animate-ping" />
              </div>

              <div>
                <div className="font-['Orbitron'] text-xs font-bold uppercase tracking-wider flex items-center gap-1.5">
                  <span>
                    {lang === 'si' ? 'නොබැඳි මාදිලිය' : lang === 'ta' ? 'ஆஃப்லைன் பயன்முறை' : 'Offline Mode Active'}
                  </span>
                  {pendingCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-950 text-amber-300 font-mono text-[10px]">
                      {pendingCount} Queued
                    </span>
                  )}
                </div>

                <div className="text-[11px] font-mono text-slate-900 font-medium">
                  {lang === 'si' 
                    ? (pendingCount > 0 ? `දත්ත යාවත්කාලීන ${pendingCount} ක් පොරොත්තුවෙන්` : 'කැෂේ කරන ලද නාසා දත්ත භාවිත වේ')
                    : lang === 'ta' 
                    ? (pendingCount > 0 ? `${pendingCount} புதுப்பிப்புகள் வரிசையில் உள்ளன` : 'சேமிக்கப்பட்ட நாசா தரவு பயன்படுத்தப்படுகிறது')
                    : (pendingCount > 0 ? `${pendingCount} mission telemetry update${pendingCount > 1 ? 's' : ''} queued` : 'Using cached APOD & mission telemetry')}
                </div>
              </div>
            </div>
          )}

          {/* 2. Re-syncing Telemetry State (When reconnecting or syncing) */}
          {isOnline && isSyncing && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-gradient-to-r from-cyan-950/95 to-indigo-950/95 border border-cyan-500/50 text-white shadow-2xl backdrop-blur-xl">
              <RefreshCw className="w-5 h-5 text-cyan-400 animate-spin" />
              <div>
                <div className="font-['Orbitron'] text-xs font-bold text-cyan-300 uppercase tracking-wider">
                  {lang === 'si' ? 'දත්ත නැවත සමමුහුර්ත වෙමින්...' : lang === 'ta' ? 'நாசா தரவு ஒத்திசைக்கப்படுகிறது...' : 'Syncing NASA Telemetry...'}
                </div>
                <div className="text-[11px] font-mono text-slate-300">
                  {lang === 'si' ? 'නවතම සජීවී නාසා දත්ත යාවත්කාලීන වේ' : lang === 'ta' ? 'நேரலை விண்வெளி தரவு புதுப்பிக்கப்படுகிறது' : 'Replaying queued requests & refreshing live feeds'}
                </div>
              </div>
            </div>
          )}

          {/* 3. Sync Successful Toast */}
          {isOnline && !isSyncing && syncSuccessMessage && (
            <div className="flex items-center gap-3 px-4 py-3 rounded-2xl bg-emerald-950/95 border border-emerald-500/60 text-white shadow-2xl backdrop-blur-xl">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
              <div>
                <div className="font-['Orbitron'] text-xs font-bold text-emerald-300 uppercase tracking-wider">
                  {lang === 'si' ? 'සමමුහුර්ත කිරීම සාර්ථකයි!' : lang === 'ta' ? 'ஒத்திசைவு முடிந்தது!' : 'Telemetry Synchronized!'}
                </div>
                <div className="text-[11px] font-mono text-emerald-200/90">
                  {syncSuccessMessage} {lastSyncedTime ? `(${lastSyncedTime})` : ''}
                </div>
              </div>
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineIndicator;
