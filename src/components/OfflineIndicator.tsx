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

  // Only show the alert if the user is truly offline; telemetry syncing executes silently in background
  const shouldShow = !isOnline;

  return (
    <AnimatePresence>
      {shouldShow && (
        <motion.div
          initial={{ opacity: 0, y: 25, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className="fixed bottom-20 sm:bottom-6 left-4 sm:left-6 z-50 font-sans select-none"
        >
          {/* Offline Mode Active with Queued Request Counter */}
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
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default OfflineIndicator;
