import React, { useState, useEffect, useCallback, useRef } from 'react';
import { fetchIssLocation } from '../lib/nasaApi';

interface IssTelemetryIndicatorProps {
  showAlt?: boolean;
  className?: string;
}

/**
 * IssTelemetryIndicator
 * 
 * Renders the live ISS velocity & altitude with an authentic Mission Control LED indicator
 * that changes color based on current telemetry update latency:
 *  - Green: < 2s update latency (Nominal high-frequency stream)
 *  - Yellow: 2-5s update latency (Standard rate / slight lag)
 *  - Blinking Red: > 5s update latency (Stale packet / reconnecting)
 */
export const IssTelemetryIndicator: React.FC<IssTelemetryIndicatorProps> = React.memo(({
  showAlt = true,
  className = ''
}) => {
  const [velocity, setVelocity] = useState<number>(27580);
  const [altitude, setAltitude] = useState<number>(418);
  const [latency, setLatency] = useState<number>(0.8);
  const [status, setStatus] = useState<'green' | 'yellow' | 'red'>('green');
  
  const lastFetchTimeRef = useRef<number>(Date.now());
  const isMountedRef = useRef<boolean>(true);

  // Periodic Telemetry Fetcher
  const updateTelemetry = useCallback(async () => {
    const startTime = performance.now();
    try {
      const data = await fetchIssLocation();
      const endTime = performance.now();
      const fetchDurationSec = (endTime - startTime) / 1000;

      if (!isMountedRef.current) return;

      lastFetchTimeRef.current = Date.now();

      if (data && typeof data.velocity === 'number' && !isNaN(data.velocity)) {
        setVelocity(Math.round(data.velocity));
      }
      if (data && typeof data.altitude === 'number' && !isNaN(data.altitude)) {
        setAltitude(Math.round(data.altitude));
      }

      // Initial latency right after fetch is the round-trip latency
      const currentLat = Math.max(0.1, fetchDurationSec);
      setLatency(currentLat);
      if (currentLat < 2.0) {
        setStatus('green');
      } else if (currentLat <= 5.0) {
        setStatus('yellow');
      } else {
        setStatus('red');
      }
    } catch {
      // In case of network error, do not break
      if (!isMountedRef.current) return;
    }
  }, []);

  useEffect(() => {
    isMountedRef.current = true;
    updateTelemetry();

    // Fetch new telemetry packet every 4 seconds
    const fetchInterval = setInterval(() => {
      updateTelemetry();
    }, 4000);

    // Latency ticker updates every 1000ms instead of 200ms
    const latencyTicker = setInterval(() => {
      const elapsedSec = (Date.now() - lastFetchTimeRef.current) / 1000;
      setLatency(elapsedSec);

      if (elapsedSec < 2.5) {
        setStatus('green');
      } else if (elapsedSec <= 5.5) {
        setStatus('yellow');
      } else {
        setStatus('red');
      }
    }, 1000);

    return () => {
      isMountedRef.current = false;
      clearInterval(fetchInterval);
      clearInterval(latencyTicker);
    };
  }, [updateTelemetry]);

  return (
    <span 
      className={`inline-flex items-center gap-1.5 font-mono select-none ${className}`}
      title={`ISS Telemetry Latency: ${latency.toFixed(1)}s (${
        status === 'green' ? '<2s Optimal' : status === 'yellow' ? '2-5s Moderate' : '>5s Stale / Reconnecting'
      })`}
    >
      {/* LED Indicator next to ISS VELOCITY */}
      <span className="relative flex items-center justify-center mr-0.5" aria-label={`Telemetry Status: ${status}`}>
        {status === 'red' ? (
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-90" />
            <span className="animate-pulse relative inline-flex rounded-full h-2 w-2 bg-red-500 shadow-[0_0_8px_#ef4444] ring-1 ring-red-400" />
          </span>
        ) : status === 'yellow' ? (
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400 shadow-[0_0_6px_#f59e0b] ring-1 ring-amber-300/60" />
          </span>
        ) : (
          <span className="relative flex h-2 w-2">
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400 shadow-[0_0_6px_#10b981] ring-1 ring-emerald-300/60" />
          </span>
        )}
      </span>

      <span>
        ISS VELOCITY: <span className="text-cyan-300 font-semibold">{velocity.toLocaleString()} KM/H</span>
      </span>

      {showAlt && (
        <>
          <span className="text-slate-500">·</span>
          <span>
            ALT: <span className="text-cyan-300 font-semibold">{altitude} KM</span>
          </span>
        </>
      )}

      {/* Subtle Latency Readout Badge */}
      <span className={`text-[9px] px-1 py-0.2 rounded font-mono ml-0.5 ${
        status === 'green' 
          ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-800/40' 
          : status === 'yellow'
          ? 'bg-amber-950/60 text-amber-400 border border-amber-800/40'
          : 'bg-red-950/60 text-red-400 border border-red-800/50 animate-pulse'
      }`}>
        {latency.toFixed(1)}s
      </span>
    </span>
  );
});

export default IssTelemetryIndicator;
