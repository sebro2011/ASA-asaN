'use client';

import React, { useState } from 'react';
import { Download, Smartphone, X, Check } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  lang?: string;
}

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({ 
  className = '',
  lang = 'en'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  // If already running as an installed PWA, hide the button
  if (isInstalled) {
    return null;
  }

  // Chromium / Android / Desktop flow
  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={install}
        className={`flex items-center gap-2 rounded-[10px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 px-3.5 py-1.5 text-xs font-mono font-bold text-white shadow-lg shadow-cyan-950/50 cursor-pointer transition active:scale-95 ${className}`}
        title="Install NASA Learn Web App"
      >
        <Download className="w-3.5 h-3.5" />
        <span>{lang === 'si' ? 'යෙදුම ස්ථාපනය කරන්න' : lang === 'ta' ? 'செயலியை நிறுவு' : 'Install App'}</span>
      </button>
    );
  }

  // iOS Safari flow (beforeinstallprompt is not supported by WebKit)
  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className={`flex items-center gap-1.5 rounded-[10px] border border-cyan-500/40 bg-surface/65 hover:bg-surface-2 px-3 py-1.5 text-xs font-mono font-medium text-cyan-300 transition cursor-pointer ${className}`}
        >
          <Smartphone className="w-3.5 h-3.5 text-cyan-400" />
          <span>Install on iOS</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="w-full max-w-sm rounded-3xl bg-abyss border border-line p-6 shadow-2xl text-ink-2 font-sans space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-base font-bold font-display text-white">
                  Install on iPhone / iPad
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  className="p-1 rounded-[8px] text-ink-3 hover:text-ink transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs leading-relaxed text-ink-2">
                <p className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold">1</span>
                  <span>Tap the <strong>Share button</strong> (square with arrow up) in the Safari toolbar.</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold">2</span>
                  <span>Scroll down and tap <strong>"Add to Home Screen"</strong> (+).</span>
                </p>
                <p className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold">3</span>
                  <span>Tap <strong>Add</strong> in the top-right corner to launch NASA Learn offline anytime.</span>
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-[10px] bg-surface/60 hover:bg-surface-2 border border-line py-2.5 text-xs font-mono font-bold text-white transition cursor-pointer"
              >
                Got It
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};

export default PWAInstallButton;
