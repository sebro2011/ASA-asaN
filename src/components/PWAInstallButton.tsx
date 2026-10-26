'use client';

import React, { useState } from 'react';
import { Download, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface PWAInstallButtonProps {
  className?: string;
  lang?: string;
}

type Copy = {
  installTitle: string;
  install: string;
  installIos: string;
  iosHeading: string;
  iosClose: string;
  step1: string;
  step2: string;
  step3: string;
  gotIt: string;
};

const COPY: Record<string, Copy> = {
  en: {
    installTitle: 'Install NASA Space Explorer',
    install: 'Install App',
    installIos: 'Install on iOS',
    iosHeading: 'Install on iPhone / iPad',
    iosClose: 'Close install guide',
    step1: 'Tap the <strong>Share button</strong> (square with an upward arrow) in the Safari toolbar.',
    step2: 'Scroll down and tap <strong>“Add to Home Screen”</strong> (+).',
    step3: 'Tap <strong>Add</strong> in the top-right corner to launch NASA Space Explorer offline anytime.',
    gotIt: 'Got It'
  },
  si: {
    installTitle: 'NASA අභ්‍යවකාශ ගවේෂක යෙදුම ස්ථාපනය කරන්න',
    install: 'යෙදුම ස්ථාපනය කරන්න',
    installIos: 'iOS මත ස්ථාපනය කරන්න',
    iosHeading: 'iPhone / iPad මත ස්ථාපනය',
    iosClose: 'ස්ථාපන මාර්ගෝපදේශය වසන්න',
    step1: 'Safari මෙවලම් තීරුවේ <strong>Share බොත්තම</strong> (ඉහළ ඊතලය සහිත චතුරස්‍රය) තට්ටු කරන්න.',
    step2: 'පහළට අනුචලනය කර <strong>“මුල් තිරයට එක් කරන්න”</strong> (+) තට්ටු කරන්න.',
    step3: 'ඉහළ දකුණු කෙළවරේ <strong>එක් කරන්න</strong> තට්ටු කරන්න — එවිට NASA අභ්‍යවකාශ ගවේෂකය ඕනෑම වේලාවක නොබැඳිව විවෘත කළ හැක.',
    gotIt: 'හරි'
  },
  ta: {
    installTitle: 'NASA விண்வெளி ஆய்வி செயலியை நிறுவு',
    install: 'செயலியை நிறுவு',
    installIos: 'iOS-இல் நிறுவு',
    iosHeading: 'iPhone / iPad-இல் நிறுவல்',
    iosClose: 'நிறுவல் வழிகாட்டியை மூடு',
    step1: 'Safari கருவிப்பட்டியில் உள்ள <strong>பகிர்வு பொத்தானை</strong> (மேல் அம்புக்குறி கொண்ட சதுரம்) தட்டவும்.',
    step2: 'கீழே உருட்டி <strong>“முகப்புத் திரையில் சேர்”</strong> (+) என்பதைத் தட்டவும்.',
    step3: 'மேல் வலது மூலையில் <strong>சேர்</strong> என்பதைத் தட்டவும் — NASA விண்வெளி ஆய்வியை எந்த நேரத்திலும் ஆஃப்லைனில் திறக்கலாம்.',
    gotIt: 'சரி'
  }
};

export const PWAInstallButton: React.FC<PWAInstallButtonProps> = ({
  className = '',
  lang = 'en'
}) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);
  const copy = COPY[lang] || COPY.en;

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
        title={copy.installTitle}
        aria-label={copy.installTitle}
        className={`flex items-center gap-2 rounded-[10px] bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 px-3.5 py-1.5 text-xs font-mono font-bold text-white shadow-lg shadow-cyan-950/50 cursor-pointer transition active:scale-95 ${className}`}
      >
        <Download className="w-3.5 h-3.5" />
        <span>{copy.install}</span>
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
          <span>{copy.installIos}</span>
        </button>

        {showIOSGuide && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4">
            <div className="w-full max-w-sm rounded-3xl bg-abyss border border-line p-6 shadow-2xl text-ink-2 font-sans space-y-4">
              <div className="flex items-center justify-between border-b border-line pb-3">
                <h3 className="text-base font-bold font-display text-white">
                  {copy.iosHeading}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label={copy.iosClose}
                  className="p-1 rounded-[8px] text-ink-3 hover:text-ink transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3 text-xs leading-relaxed text-ink-2">
                <p className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold">1</span>
                  <span dangerouslySetInnerHTML={{ __html: copy.step1 }} />
                </p>
                <p className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold">2</span>
                  <span dangerouslySetInnerHTML={{ __html: copy.step2 }} />
                </p>
                <p className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-cyan-500/20 text-cyan-400 flex items-center justify-center shrink-0 font-mono font-bold">3</span>
                  <span dangerouslySetInnerHTML={{ __html: copy.step3 }} />
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="w-full rounded-[10px] bg-surface/60 hover:bg-surface-2 border border-line py-2.5 text-xs font-mono font-bold text-white transition cursor-pointer"
              >
                {copy.gotIt}
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
