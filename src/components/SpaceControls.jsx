'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  RotateCw, 
  ZoomIn, 
  ZoomOut, 
  RefreshCw, 
  Smartphone
} from 'lucide-react';
import { useTrilingual } from '../context/TrilingualProvider';

/**
 * SpaceControls Component
 * Translucent HUD overlay for 3D orbital manipulation and WebXR / AR mobile anchoring.
 */
export function SpaceControls({
  onRotate = () => {},
  onReset = () => {},
  onZoomIn = () => {},
  onZoomOut = () => {},
  selectedBody = 'Mars',
  isRotating = true,
  onToggleRotation = () => {}
}) {
  const { lang, t } = useTrilingual();
  const [isXrSupported, setIsXrSupported] = useState(false);
  const [xrActive, setXrActive] = useState(false);
  const [showXrModal, setShowXrModal] = useState(false);
  const xrSessionRef = React.useRef(null);

  useEffect(() => {
    if (typeof window !== 'undefined' && 'xr' in navigator && navigator.xr) {
      if (typeof navigator.xr.isSessionSupported === 'function') {
        navigator.xr.isSessionSupported('immersive-ar')
          .then((supported) => setIsXrSupported(Boolean(supported)))
          .catch(() => setIsXrSupported(false));
      }
    }

    return () => {
      // Safe WebXR cleanup with optional chaining
      if (xrSessionRef.current) {
        try {
          xrSessionRef.current?.end?.()?.catch(() => {});
        } catch (_) {}
        xrSessionRef.current = null;
      }
    };
  }, []);

  const handleLaunchAR = async () => {
    if (typeof window === 'undefined') return;

    // If session is already active, safely end it
    if (xrSessionRef.current) {
      try {
        await xrSessionRef.current?.end?.()?.catch(() => {});
      } catch (_) {}
      xrSessionRef.current = null;
      setXrActive(false);
      return;
    }

    if (typeof navigator !== 'undefined' && 'xr' in navigator && navigator.xr && typeof navigator.xr.requestSession === 'function') {
      try {
        // Pre-check if immersive-ar is truly supported on current hardware
        const isSupported = typeof navigator.xr.isSessionSupported === 'function'
          ? await navigator.xr.isSessionSupported('immersive-ar').catch(() => false)
          : false;

        if (!isSupported) {
          setShowXrModal(true);
          return;
        }

        let session = null;
        try {
          // Use optionalFeatures rather than requiredFeatures so missing hit-test or local-floor does not throw NotSupportedError
          session = await navigator.xr.requestSession('immersive-ar', {
            optionalFeatures: ['hit-test', 'local-floor']
          });
        } catch (_) {
          // Graceful fallback to plain session
          try {
            session = await navigator.xr.requestSession('immersive-ar');
          } catch {
            session = null;
          }
        }

        if (session) {
          xrSessionRef.current = session;
          setXrActive(true);
          session.addEventListener('end', () => {
            xrSessionRef.current = null;
            setXrActive(false);
          });
        } else {
          setShowXrModal(true);
        }
      } catch {
        setShowXrModal(true);
      }
    } else {
      setShowXrModal(true);
    }
  };

  return (
    <>
      <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-30 flex items-center gap-2 p-1.5 rounded-2xl bg-slate-950/80 border border-slate-800/80 backdrop-blur-xl shadow-2xl">
        {/* Toggle Auto Rotation */}
        <button
          type="button"
          onClick={onToggleRotation}
          className={`p-2.5 rounded-xl transition flex items-center gap-1.5 text-xs font-mono font-bold cursor-pointer ${
            isRotating 
              ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 shadow-sm shadow-cyan-500/20' 
              : 'bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-800'
          }`}
          title={t('rotate')}
        >
          <RotateCw className={`w-4 h-4 ${isRotating ? 'animate-spin text-cyan-400' : 'text-slate-400'}`} style={{ animationDuration: '8s' }} />
          <span className="hidden sm:inline">{isRotating ? 'Rotating' : t('rotate')}</span>
        </button>

        {/* Zoom In */}
        <button
          type="button"
          onClick={onZoomIn}
          className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition cursor-pointer"
          title={t('zoomIn')}
        >
          <ZoomIn className="w-4 h-4 text-cyan-400" />
        </button>

        {/* Zoom Out */}
        <button
          type="button"
          onClick={onZoomOut}
          className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition cursor-pointer"
          title={t('zoomOut')}
        >
          <ZoomOut className="w-4 h-4 text-cyan-400" />
        </button>

        {/* Reset Camera View */}
        <button
          type="button"
          onClick={onReset}
          className="p-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-800 hover:border-slate-700 transition cursor-pointer"
          title={t('reset')}
        >
          <RefreshCw className="w-4 h-4 text-indigo-400" />
        </button>

        {/* WebXR / AR Mobile Spatial Anchor Button */}
        <button
          type="button"
          onClick={handleLaunchAR}
          className="px-3.5 py-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-['Orbitron'] font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-purple-950/60 transition active:scale-95 cursor-pointer"
          title={t('arView')}
        >
          <Smartphone className="w-3.5 h-3.5 text-purple-200 animate-pulse" />
          <span>{t('arView')}</span>
        </button>
      </div>

      {/* WebXR Fallback / Information Lightbox */}
      <AnimatePresence>
        {showXrModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md rounded-3xl bg-slate-950 border border-purple-500/40 p-6 shadow-2xl text-slate-200 font-sans space-y-4"
            >
              <div className="flex items-center gap-3 border-b border-slate-800 pb-3">
                <div className="p-2 rounded-xl bg-purple-500/20 text-purple-400">
                  <Smartphone className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold font-['Orbitron'] text-white">
                    NASA Augmented Reality
                  </h3>
                  <p className="text-xs text-slate-400">WebXR Spatial Computing Bridge</p>
                </div>
              </div>

              <div className="text-xs space-y-2 text-slate-300 leading-relaxed font-mono">
                <p>
                  To anchor the 3D <strong>{selectedBody}</strong> celestial model in physical space:
                </p>
                <ul className="space-y-1.5 list-disc list-inside text-slate-400">
                  <li>Open on an Android device running Chrome with Google Play Services for AR (ARCore).</li>
                  <li>Or open on an iOS device with Safari to launch native QuickLook USDZ projection.</li>
                </ul>
              </div>

              <button
                type="button"
                onClick={() => setShowXrModal(false)}
                className="w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-700 text-xs font-mono font-bold text-white transition cursor-pointer"
              >
                Close
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
}

export default SpaceControls;
