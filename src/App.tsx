import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { SupportedLanguage } from './i18n/translations';
import AnimatedNavbar from './components/AnimatedNavbar.jsx';
import CosmicStarfieldBackground from './components/CosmicStarfieldBackground.jsx';
import AmbientSoundscapeControl from './components/AmbientSoundscapeControl';
import PulsarLoader from './components/PulsarLoader';
import AtmosphericEntryTransition from './components/AtmosphericEntryTransition';
import HeroBackgroundEarth from './components/HeroBackgroundEarth';
import NASABottomBar from './components/NASABottomBar';
import { ApodViewer } from './components/ApodViewer';
import { Space3DViewer } from './components/Space3DViewer';
import { MissionsTimeline } from './components/MissionsTimeline';
import { NewsSection } from './components/NewsSection';
import { SavedFavorites } from './components/SavedFavorites';
import { SpaceTriviaQuiz } from './components/SpaceTriviaQuiz';
import ISSTracker from './components/ISSTracker.jsx';
import IssTracker2D from './components/IssTracker2D.jsx';
import AsteroidRadar from './components/AsteroidRadar.jsx';
import EPICViewer from './components/EPICViewer.jsx';
import ExoplanetLab from './components/ExoplanetLab.jsx';
import EarthIntelligenceLab from './components/EarthIntelligenceLab.jsx';
import FloatingVoiceControl from './components/FloatingVoiceControl.jsx';
import SolarWeather from './components/SolarWeather.jsx';
import SpaceQuizModule from './components/SpaceQuizModule.jsx';
import SmartSpaceQuiz from './components/SmartSpaceQuiz.jsx';
import MarsImageTagger from './components/MarsImageTagger.jsx';
import PWAInstallButton from './components/PWAInstallButton';
import OfflineIndicator from './components/OfflineIndicator';
import { ExportHtmlModal } from './components/ExportHtmlModal';
import NasaAi from './components/NasaAi.jsx';
import OpenRouterChat from './components/OpenRouterChat.jsx';
import GeminiChatWidget from './components/GeminiChatWidget.jsx';
import GeminiLiveVoice from './components/GeminiLiveVoice.jsx';
import { CosmicAudioHeaderButton, SpaceAudioPlayer } from './components/SpaceAudioPlayer.jsx';
import ARPlanetViewer from './components/ARPlanetViewer.jsx';
import CosmicCalendar from './components/CosmicCalendar.jsx';
import IssTelemetryIndicator from './components/IssTelemetryIndicator';
import Logo from './components/Logo';
import RocketLaunchSimulator from './components/RocketLaunchSimulator';
import { useFavorites } from './utils/favorites';
import { 
  Sparkles, 
  Orbit, 
  Rocket, 
  Newspaper, 
  Compass, 
  ExternalLink, 
  FileCode,
  Globe2,
  Cpu,
  Bookmark,
  Heart,
  Radio,
  Clock,
  Activity,
  Layers,
  ChevronRight,
  ShieldCheck,
  Bot,
  MessageSquare,
  BrainCircuit,
  Award,
  Target,
  Flame,
  Leaf
} from 'lucide-react';

type TabKey = 'apod' | '3d' | 'asteroids' | 'epic' | 'exoplanets' | 'earth' | 'missions' | 'launch' | 'news' | 'saved' | 'assistant' | 'quiz' | 'iss';

// Isolated, memoized live clock to completely eliminate full-page App re-renders every 1s
const LiveUtcClock = React.memo(() => {
  const [time, setTime] = useState<string>(() =>
    new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC'
  );

  useEffect(() => {
    const update = () => {
      setTime(new Date().toISOString().replace('T', ' ').substring(0, 19) + ' UTC');
    };
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, []);

  return <span>{time}</span>;
});

// Micro-interaction container for dashboard tile icons with impact scale and pulse shockwave
const TileImpactIcon = ({
  isImpacted,
  impactId,
  colorClass,
  badgeBg,
  badgeBorder,
  children
}: {
  isImpacted: boolean;
  impactId: number;
  colorClass: string;
  badgeBg: string;
  badgeBorder: string;
  children: React.ReactNode;
}) => {
  return (
    <motion.div
      animate={
        isImpacted
          ? {
              scale: [1, 1.16, 0.94, 1.05, 1],
            }
          : { scale: 1 }
      }
      transition={{ duration: 0.5, ease: 'easeOut' }}
      className={`w-8 h-8 rounded-2xl ${badgeBg} ${badgeBorder} flex items-center justify-center relative overflow-visible ${colorClass}`}
    >
      {/* Shockwave ripple when clicked */}
      {isImpacted && (
        <motion.span
          key={`shockwave-${impactId}`}
          initial={{ scale: 0.8, opacity: 0.95 }}
          animate={{ scale: 2.2, opacity: 0 }}
          transition={{ duration: 0.55, ease: 'easeOut' }}
          className="absolute inset-0 rounded-2xl border-2 border-current pointer-events-none"
        />
      )}
      {/* Impact pulse and scale on the icon itself */}
      <motion.div
        key={isImpacted ? `icon-impact-${impactId}` : 'icon-idle'}
        animate={
          isImpacted
            ? {
                scale: [1, 1.48, 0.86, 1.16, 1],
                rotate: [0, -8, 8, -4, 0],
                filter: [
                  'drop-shadow(0 0 0px currentColor)',
                  'drop-shadow(0 0 12px currentColor)',
                  'drop-shadow(0 0 4px currentColor)',
                  'drop-shadow(0 0 0px currentColor)'
                ]
              }
            : { scale: 1, rotate: 0 }
        }
        transition={{
          duration: 0.5,
          times: [0, 0.25, 0.5, 0.75, 1],
          ease: 'easeOut'
        }}
        className="flex items-center justify-center relative z-10"
      >
        {children}
      </motion.div>
    </motion.div>
  );
};

export default function App() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2) as SupportedLanguage;
  const [activeTab, setActiveTab] = useState<TabKey>('apod');
  const [displayedTab, setDisplayedTab] = useState<TabKey>('apod');
  const [isTabLoading, setIsTabLoading] = useState<boolean>(false);
  const [targetApodDate, setTargetApodDate] = useState<string | undefined>(undefined);
  const [targetMissionId, setTargetMissionId] = useState<string | undefined>(undefined);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const [isLiveVoiceModalOpen, setIsLiveVoiceModalOpen] = useState<boolean>(false);
  const [impactTile, setImpactTile] = useState<TabKey | null>(null);
  const [impactId, setImpactId] = useState<number>(0);
  const { totalCount, savedApods, savedMissionIds } = useFavorites();

  const triggerTileImpact = (tab: TabKey) => {
    setImpactTile(tab);
    setImpactId((prev) => prev + 1);
  };

  const handleTileClick = (tab: TabKey) => {
    triggerTileImpact(tab);
    handleTabSwitch(tab);
  };

  // Sync HTML title & lang
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const handleTabSwitch = (tab: TabKey) => {
    triggerTileImpact(tab);
    if (tab === activeTab) return;

    setActiveTab(tab);
    setDisplayedTab(tab);
    setIsTabLoading(false);

    const element = document.getElementById('main-tab-content');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }
  };

  // Voice Navigation command dispatcher
  const handleVoiceNavigate = (target: string) => {
    if (target === 'mars') {
      setTargetMissionId('perseverance');
      handleTabSwitch('missions');
    } else if (target === 'sun') {
      handleTabSwitch('missions');
    } else if (target === 'iss') {
      handleTabSwitch('iss');
    } else if (target === 'epic') {
      handleTabSwitch('epic');
    } else if (target === 'exoplanets') {
      handleTabSwitch('exoplanets');
    } else if (target === 'earth' || target === 'earthlab' || target === 'climate' || target === 'weather') {
      handleTabSwitch('earth');
    } else if (target === 'asteroids') {
      handleTabSwitch('asteroids');
    } else if (target === 'apod') {
      handleTabSwitch('apod');
    } else if (target === 'quiz') {
      handleTabSwitch('quiz');
    } else if (target === 'launch' || target === 'rocket' || target === 'simulator') {
      handleTabSwitch('launch');
    }
  };

  const handleVoiceCameraAction = (action: string) => {
    window.dispatchEvent(new CustomEvent('nasa-camera-action', { detail: { action } }));
  };

  // iOS-style Horizontal touch-swipe navigation across content tabs (mobile / tablet < 1024px)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    let touchStartX = 0;
    let touchStartY = 0;
    let touchStartTime = 0;
    let shouldIgnore = false;

    const navTabsSequence: TabKey[] = [
      'apod',
      'launch',
      '3d',
      'missions',
      'news',
      'quiz',
      'iss',
      'earth',
      'assistant'
    ];

    const handleTouchStart = (e: TouchEvent) => {
      if (window.innerWidth >= 1024 || !e.touches || e.touches.length !== 1) return;

      const target = e.target as HTMLElement | null;
      // Exclude interactive elements: 3D canvas (OrbitControls), inputs, textareas, buttons, and modals
      if (
        target?.closest('canvas') ||
        target?.closest('input') ||
        target?.closest('textarea') ||
        target?.closest('select') ||
        target?.closest('button') ||
        target?.closest('[data-no-swipe]') ||
        target?.closest('.no-swipe') ||
        target?.closest('[role="dialog"]')
      ) {
        shouldIgnore = true;
        return;
      }

      shouldIgnore = false;
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
      touchStartTime = Date.now();
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (shouldIgnore || window.innerWidth >= 1024) return;
      if (!e.changedTouches || e.changedTouches.length !== 1) return;

      const touchEndX = e.changedTouches[0].clientX;
      const touchEndY = e.changedTouches[0].clientY;
      const deltaX = touchEndX - touchStartX;
      const deltaY = touchEndY - touchStartY;
      const elapsed = Date.now() - touchStartTime;

      // Deliberate horizontal swipe
      if (elapsed < 450 && Math.abs(deltaX) > 65 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        const currentIndex = navTabsSequence.indexOf(activeTab);
        if (currentIndex !== -1) {
          if (deltaX < -65 && currentIndex < navTabsSequence.length - 1) {
            handleTabSwitch(navTabsSequence[currentIndex + 1]);
          } else if (deltaX > 65 && currentIndex > 0) {
            handleTabSwitch(navTabsSequence[currentIndex - 1]);
          }
        }
      }
    };

    window.addEventListener('touchstart', handleTouchStart, { passive: true });
    window.addEventListener('touchend', handleTouchEnd, { passive: true });

    return () => {
      window.removeEventListener('touchstart', handleTouchStart);
      window.removeEventListener('touchend', handleTouchEnd);
    };
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-[#010409] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden pb-24 lg:pb-0">
      {/* High-Performance 60FPS Cosmic Starfield & Meteor Particle Background */}
      <CosmicStarfieldBackground starCount={240} enableMeteors={true} speed={0.28} />

      {/* Mission Control Live Telemetry Top Strip */}
      <div className="relative z-50 bg-[#010409]/90 border-b border-slate-800/60 py-2 px-4 text-[11px] font-mono text-slate-300">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              DSN LIVE LINK
            </span>
            <span className="hidden sm:inline text-slate-600">|</span>
            <span className="flex items-center gap-1 text-slate-300">
              <Clock className="w-3 h-3 text-cyan-400" />
              <LiveUtcClock />
            </span>
            <span className="hidden md:inline text-slate-600">|</span>
            <span className="hidden md:inline text-slate-400">
              <IssTelemetryIndicator />
            </span>
          </div>

          <div className="flex items-center gap-3">
            {/* Ambient Planetary Soundscape Mute/Unmute Cosmic Button */}
            <CosmicAudioHeaderButton lang={lang} />

            {/* Gemini Live Bidi Real-Time Voice Button in Mission Control Header */}
            <button
              onClick={() => setIsLiveVoiceModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-cyan-950/80 hover:bg-cyan-900 border border-cyan-500/50 hover:border-cyan-400 text-cyan-300 font-mono text-[11px] font-bold shadow-[0_0_15px_rgba(6,182,212,0.3)] transition hover:scale-105 active:scale-95 cursor-pointer"
              title="Open Gemini Live Bidi Voice Link (16kHz PCM In • 24kHz PCM Out)"
            >
              <Radio className="w-3.5 h-3.5 text-cyan-400 animate-pulse" />
              <span className="hidden sm:inline">LIVE VOICE</span>
            </button>

            <span className="hidden lg:inline text-slate-400">
              AI ENGINE: <span className="text-emerald-300 font-semibold">GEMINI 3.8 LIVE</span>
            </span>
            {/* PWA In-App Install Button */}
            <PWAInstallButton lang={lang} />
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1 transition"
            >
              <FileCode className="w-3 h-3" />
              <span>{t('navExportHtml')}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Enhanced Animated Navigation Bar with Framer Motion layoutId */}
      <AnimatedNavbar
        activeTab={activeTab}
        onTabChange={(tab) => handleTabSwitch(tab as any)}
        onOpenExportModal={() => setIsExportModalOpen(true)}
      />

      {/* Main Content Dashboard Container */}
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 pt-4 sm:pt-6 pb-24 space-y-6 sm:space-y-8">
        
        {/* Sleek Hero Banner - Deep Dark Space UI with Embedded 3D Earth Background */}
        <section className="relative">
          <div className="bg-gradient-to-b from-[#010409] via-[#020817] to-[#010409] border border-slate-800/80 rounded-2xl py-10 sm:py-12 md:py-14 px-6 sm:px-8 md:px-10 relative overflow-hidden shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-6 sm:gap-8 min-h-[420px] md:min-h-[460px]">
            
            {/* Embedded Auto-Rotating 3D Earth Background with Atmospheric Glow & Mouse Parallax */}
            <HeroBackgroundEarth />

            {/* Subtle atmospheric blue gradient accents */}
            <div className="absolute -bottom-24 -right-24 w-[480px] h-[480px] rounded-full bg-radial from-cyan-500/10 via-blue-600/5 to-transparent blur-3xl pointer-events-none z-[1]" />
            <div className="absolute -top-32 left-1/4 w-96 h-96 rounded-full bg-radial from-sky-400/10 to-transparent blur-3xl pointer-events-none z-[1]" />

            <div className="relative z-10 max-w-3xl space-y-4 sm:space-y-5">
              <div className="inline-flex items-center gap-2 px-3 py-1 sm:px-3.5 sm:py-1.5 rounded-full bg-slate-950/80 border border-slate-800/80 font-mono text-cyan-400 text-[11px] sm:text-xs font-semibold shadow-inner max-w-full overflow-hidden text-ellipsis backdrop-blur-md">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
                </span>
                <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                <span className="tracking-wide truncate">
                  {lang === 'en' && 'Real-Time NASA Feed & Keyless AI Dynamic Translation'}
                  {lang === 'si' && 'නාසා සජීවී දත්ත සහ Keyless AI ස්වභාවික සිංහල පරිවර්තනය'}
                  {lang === 'ta' && 'நாசா நேரலை தரவு & Keyless AI துல்லிய தமிழ் மொழிபெயர்ப்பு'}
                </span>
              </div>

              <h1 className="text-2xl sm:text-4xl md:text-5xl lg:text-6xl xl:text-7xl font-serif tracking-tight text-white leading-[1.12] drop-shadow-md">
                {lang === 'en' && (
                  <>Explore the Cosmos in <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">Three Languages</span></>
                )}
                {lang === 'si' && (
                  <>විශ්වයේ විස්මිත අසිරිය <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">සිංහල බසින්</span> විඳගන්න</>
                )}
                {lang === 'ta' && (
                  <>பிரபஞ்சத்தின் அதிசயங்களை <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-blue-500 bg-clip-text text-transparent">தமிழில்</span> ஆராயுங்கள்</>
                )}
              </h1>

              <p className="text-xs sm:text-sm md:text-base lg:text-lg text-slate-300 leading-relaxed max-w-2xl font-sans drop-shadow-sm">
                {lang === 'en' && 'Astronomy Picture of the Day (APOD), interactive 3D celestial mechanics, landmark spaceflight breakdowns from Apollo to Artemis, and live deep-space discoveries translated dynamically on-the-fly.'}
                {lang === 'si' && 'නාසා ආයතනයේ දවසේ තාරකා විද්‍යා ඡායාරූපය (APOD), ත්‍රිමාන (3D) අභ්‍යවකාශ ආකෘති, ඇපලෝ සිට ආටෙමිස් දක්වා ඓතිහාසික චන්ද්‍ර මෙහෙයුම් සහ සජීවී විද්‍යා පුවත් එකම වේදිකාවකින්.'}
                {lang === 'ta' && 'நாசாவின் நாளின் வானியல் புகைப்படம் (APOD), 3D கோளப் பார்வை, வரலாற்று விண்வெளி பயணங்களின் விரிவான தகவல்கள் மற்றும் நேரலைச் செய்திகள்.'}
              </p>

              {/* Fast Direct Exploration Action Triggers (Replaces legacy slider with high-efficiency 1-click CTA) */}
              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleTabSwitch('3d')}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white font-semibold text-xs sm:text-sm flex items-center gap-2 shadow-lg shadow-cyan-500/25 hover:shadow-cyan-500/40 transition-all cursor-pointer group active:scale-[0.98]"
                >
                  <Orbit className="w-4 h-4 text-cyan-200 group-hover:rotate-45 transition-transform" />
                  <span>
                    {lang === 'si' ? '3D අභ්‍යවකාශගාරය අරඹන්න' :
                     lang === 'ta' ? '3D ஆய்வகத்தை தொடங்கு' :
                     'Launch 3D Space Lab'}
                  </span>
                  <ChevronRight className="w-3.5 h-3.5 text-cyan-200/80 group-hover:translate-x-0.5 transition-transform" />
                </button>

                <button
                  type="button"
                  onClick={() => handleTabSwitch('missions')}
                  className="px-4 py-2.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-700/80 hover:border-cyan-500/50 text-slate-200 hover:text-white font-medium text-xs sm:text-sm flex items-center gap-2 transition-all cursor-pointer backdrop-blur-md active:scale-[0.98]"
                >
                  <Rocket className="w-4 h-4 text-cyan-400" />
                  <span>
                    {lang === 'si' ? 'ඓතිහාසික මෙහෙයුම්' :
                     lang === 'ta' ? 'வரலாற்றுப் பயணங்கள்' :
                     'Landmark Missions'}
                  </span>
                </button>
              </div>
            </div>

            {/* Glowing Hero Planetary App Badge Logo Container - Translucent Glass reveals Earth behind */}
            <div className="hidden lg:flex flex-col items-center justify-center p-7 rounded-2xl bg-slate-950/60 border border-slate-800/80 backdrop-blur-md shadow-2xl relative shrink-0 group z-10">
              <div className="absolute inset-0 bg-cyan-500/10 rounded-2xl blur-2xl group-hover:bg-cyan-500/20 transition-all pointer-events-none" />
              <Logo size="xl" pulse={true} withGlow={true} />
              <div className="mt-3.5 text-center">
                <span className="font-['Orbitron'] font-black text-sm tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-white via-cyan-200 to-cyan-400">
                  NASA WEB APP
                </span>
                <p className="text-[10px] font-mono text-cyan-400 mt-0.5">
                  v2.5.0 • TRILINGUAL EDITION
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Space Dashboard Multi-Card Grid Hub - Glassmorphic Slate with Glowing Hover */}
        <section className="relative">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-2.5 sm:gap-3 md:gap-4">
            {/* Tile 1: APOD */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('apod')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'apod'
                  ? 'border-cyan-400/80 ring-2 ring-cyan-400/80 shadow-[0_0_25px_rgba(34,211,238,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'apod' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'apod'}
                  impactId={impactId}
                  colorClass="text-cyan-300"
                  badgeBg="bg-cyan-500/20"
                  badgeBorder="border border-cyan-500/40"
                >
                  <Compass className="w-4 h-4 text-cyan-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  SYS.01
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {t('navApod')}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  4K Imagery
                </p>
              </div>
            </motion.button>

            {/* Tile 2: 3D Space Lab */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('3d')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === '3d'
                  ? 'border-blue-400/80 ring-2 ring-blue-400/80 shadow-[0_0_25px_rgba(59,130,246,0.25)]'
                  : ''
              }`}
            >
              {activeTab === '3d' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === '3d'}
                  impactId={impactId}
                  colorClass="text-blue-300"
                  badgeBg="bg-blue-500/20"
                  badgeBorder="border border-blue-500/40"
                >
                  <Orbit className="w-4 h-4 text-blue-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  SYS.02
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {t('nav3D')}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  Planets & JWST
                </p>
              </div>
            </motion.button>

            {/* Tile 3: Asteroid Radar */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('asteroids')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'asteroids'
                  ? 'border-rose-400/80 ring-2 ring-rose-400/80 shadow-[0_0_25px_rgba(244,63,94,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'asteroids' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'asteroids'}
                  impactId={impactId}
                  colorClass="text-rose-300"
                  badgeBg="bg-rose-500/20"
                  badgeBorder="border border-rose-500/40"
                >
                  <Target className="w-4 h-4 text-rose-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  SYS.03
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {lang === 'si' ? 'රේඩාර්' : lang === 'ta' ? 'ரேடார்' : 'Asteroids'}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  Near-Earth
                </p>
              </div>
            </motion.button>

            {/* Tile 4: EPIC Earth */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('epic')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'epic'
                  ? 'border-emerald-400/80 ring-2 ring-emerald-400/80 shadow-[0_0_25px_rgba(16,185,129,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'epic' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'epic'}
                  impactId={impactId}
                  colorClass="text-emerald-300"
                  badgeBg="bg-emerald-500/20"
                  badgeBorder="border border-emerald-500/40"
                >
                  <Globe2 className="w-4 h-4 text-emerald-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  SYS.04
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  EPIC Earth
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  Daily Globe
                </p>
              </div>
            </motion.button>

            {/* Tile 5: Exoplanet Lab */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('exoplanets')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'exoplanets'
                  ? 'border-violet-400/80 ring-2 ring-violet-400/80 shadow-[0_0_25px_rgba(139,92,246,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'exoplanets' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'exoplanets'}
                  impactId={impactId}
                  colorClass="text-violet-300"
                  badgeBg="bg-violet-500/20"
                  badgeBorder="border border-violet-500/40"
                >
                  <Sparkles className="w-4 h-4 text-violet-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  SYS.05
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {lang === 'si' ? 'බාහිර ග්‍රහ' : lang === 'ta' ? 'புறக்கோள்' : 'Exoplanets'}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  Kepler & TESS
                </p>
              </div>
            </motion.button>

            {/* Tile 6: Landmark Missions */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('missions')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'missions'
                  ? 'border-amber-400/80 ring-2 ring-amber-400/80 shadow-[0_0_25px_rgba(245,158,11,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'missions' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'missions'}
                  impactId={impactId}
                  colorClass="text-amber-300"
                  badgeBg="bg-amber-500/20"
                  badgeBorder="border border-amber-500/40"
                >
                  <Rocket className="w-4 h-4 text-amber-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  SYS.06
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {t('navMissions')}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  Apollo to Artemis
                </p>
              </div>
            </motion.button>

            {/* Tile 7: NASA News */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('news')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'news'
                  ? 'border-teal-400/80 ring-2 ring-teal-400/80 shadow-[0_0_25px_rgba(20,184,166,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'news' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'news'}
                  impactId={impactId}
                  colorClass="text-teal-300"
                  badgeBg="bg-teal-500/20"
                  badgeBorder="border border-teal-500/40"
                >
                  <Newspaper className="w-4 h-4 text-teal-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30">
                  SYS.07
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {t('navNews')}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  AI Translation
                </p>
              </div>
            </motion.button>

            {/* Tile 8: Space Trivia Quiz */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('quiz')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'quiz'
                  ? 'border-cyan-400/80 ring-2 ring-cyan-400/80 shadow-[0_0_25px_rgba(6,182,212,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'quiz' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'quiz'}
                  impactId={impactId}
                  colorClass="text-cyan-300"
                  badgeBg="bg-cyan-500/20"
                  badgeBorder="border border-cyan-500/40"
                >
                  <BrainCircuit className="w-4 h-4 text-cyan-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                  SYS.08
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {lang === 'si' ? 'දැනුම මිනුම' : lang === 'ta' ? 'வினாடி வினா' : 'Space Trivia'}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  {lang === 'si' ? 'AI ප්‍රශ්නාවලිය' : lang === 'ta' ? 'AI வினாக்கள்' : 'AI Quiz'}
                </p>
              </div>
            </motion.button>

            {/* Tile 9: ISS Tracker */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('iss')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'iss'
                  ? 'border-indigo-400/80 ring-2 ring-indigo-400/80 shadow-[0_0_25px_rgba(99,102,241,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'iss' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'iss'}
                  impactId={impactId}
                  colorClass="text-indigo-300"
                  badgeBg="bg-indigo-500/20"
                  badgeBorder="border border-indigo-500/40"
                >
                  <Globe2 className="w-4 h-4 text-indigo-300 animate-spin" style={{ animationDuration: '30s' }} />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping" />
                  SYS.09
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {lang === 'si' ? 'ISS' : lang === 'ta' ? 'ISS' : 'ISS Tracker'}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  {lang === 'si' ? 'කක්ෂය' : lang === 'ta' ? 'சுற்றுப்பாதை' : 'Real-Time'}
                </p>
              </div>
            </motion.button>

            {/* Tile 10: AI Assistant */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('assistant')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'assistant'
                  ? 'border-purple-400/80 ring-2 ring-purple-400/80 shadow-[0_0_25px_rgba(168,85,247,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'assistant' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'assistant'}
                  impactId={impactId}
                  colorClass="text-purple-300"
                  badgeBg="bg-purple-500/20"
                  badgeBorder="border border-purple-500/40"
                >
                  <Bot className="w-4 h-4 text-purple-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  SYS.10
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  AI Chat
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  Trilingual Assistant
                </p>
              </div>
            </motion.button>

            {/* Tile 11: Saved Favorites */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('saved')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'saved'
                  ? 'border-pink-400/80 ring-2 ring-pink-400/80 shadow-[0_0_25px_rgba(244,63,94,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'saved' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'saved'}
                  impactId={impactId}
                  colorClass="text-pink-400"
                  badgeBg="bg-pink-500/20"
                  badgeBorder="border border-pink-500/40"
                >
                  <Heart className={`w-4 h-4 ${totalCount > 0 ? 'text-pink-400 fill-pink-500/40' : 'text-pink-400'}`} />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 font-bold">
                  {totalCount}
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {t('navSaved')}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  Cosmic Favorites
                </p>
              </div>
            </motion.button>

            {/* Tile 12: Launch Sim Control Room */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('launch')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'launch'
                  ? 'border-orange-400/80 ring-2 ring-orange-400/80 shadow-[0_0_25px_rgba(249,115,22,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'launch' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'launch'}
                  impactId={impactId}
                  colorClass="text-orange-400"
                  badgeBg="bg-orange-500/20"
                  badgeBorder="border border-orange-500/40"
                >
                  <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold">
                  SYS.12
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  Launch Sim
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  Control Room
                </p>
              </div>
            </motion.button>

            {/* Tile 13: Earth Intelligence Lab */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => handleTileClick('earth')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-950/80 backdrop-blur-xl border border-slate-800/80 text-left hover:border-cyan-500/50 hover:shadow-[0_0_25px_rgba(34,211,238,0.15)] transition-all duration-300 relative overflow-hidden flex flex-col justify-between shadow-xl ${
                activeTab === 'earth'
                  ? 'border-lime-400/80 ring-2 ring-lime-400/80 shadow-[0_0_25px_rgba(132,204,22,0.25)]'
                  : ''
              }`}
            >
              {activeTab === 'earth' && (
                <div className="absolute top-0 left-0 right-0 h-[2px] bg-gradient-to-r from-cyan-400 via-sky-400 to-blue-500" />
              )}
              <div className="flex items-center justify-between w-full">
                <TileImpactIcon
                  isImpacted={impactTile === 'earth'}
                  impactId={impactId}
                  colorClass="text-lime-300"
                  badgeBg="bg-lime-500/20"
                  badgeBorder="border border-lime-500/40"
                >
                  <Leaf className="w-4 h-4 text-lime-300" />
                </TileImpactIcon>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-lime-500/15 text-lime-300 border border-lime-500/30">
                  SYS.13
                </span>
              </div>
              <div className="mt-2.5">
                <h3 className="text-xs sm:text-sm font-bold text-white font-['Orbitron'] truncate">
                  {t('navEarthLab')}
                </h3>
                <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-1">
                  Climate Archive
                </p>
              </div>
            </motion.button>
          </div>
        </section>

        {/* Dashboard Workspace Display (Active View) */}
        <div id="main-tab-content" className="scroll-mt-24">
          <AnimatePresence mode="wait">
            {isTabLoading && (
              <PulsarLoader key={`loader-${activeTab}`} targetTab={activeTab} lang={lang} />
            )}

            {!isTabLoading && displayedTab === 'apod' && (
              <AtmosphericEntryTransition key="entry-apod" tabKey="apod">
                <section className="space-y-4">
                  <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2 sm:gap-2.5 font-['Orbitron']">
                        <Compass className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />
                        <span>{t('apodHeading')}</span>
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1">
                        {t('apodSubheading')}
                      </p>
                    </div>
                  </div>

                  <ApodViewer 
                    lang={lang} 
                    onOpenExportModal={() => setIsExportModalOpen(true)} 
                    initialDate={targetApodDate}
                  />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === '3d' && (
              <AtmosphericEntryTransition key="entry-3d" tabKey="3d">
                <section className="space-y-6">
                  <div className="border-b border-slate-800/80 pb-3">
                    <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2 sm:gap-2.5 font-['Orbitron']">
                      <Orbit className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />
                      <span>{t('visualizerHeading')}</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      {t('visualizerSubheading')}
                    </p>
                  </div>

                  <Space3DViewer lang={lang} />

                  {/* AR Augmented Reality Planet & Spacecraft Viewer (WebXR / Quick Look) */}
                  <ARPlanetViewer lang={lang} />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'asteroids' && (
              <AtmosphericEntryTransition key="entry-asteroids" tabKey="asteroids">
                <AsteroidRadar lang={lang} />
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'epic' && (
              <AtmosphericEntryTransition key="entry-epic" tabKey="epic">
                <EPICViewer lang={lang} />
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'exoplanets' && (
              <AtmosphericEntryTransition key="entry-exoplanets" tabKey="exoplanets">
                <ExoplanetLab lang={lang} />
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'earth' && (
              <AtmosphericEntryTransition key="entry-earth" tabKey="earth">
                <section className="space-y-6">
                  <div className="border-b border-slate-800/80 pb-3">
                    <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2 sm:gap-2.5 font-['Orbitron']">
                      <Leaf className="w-5 h-5 sm:w-6 sm:h-6 text-lime-400 shrink-0" />
                      <span>{t('earthHeading')}</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      {t('earthSubheading')}
                    </p>
                  </div>

                  <EarthIntelligenceLab lang={lang} />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'missions' && (
              <AtmosphericEntryTransition key="entry-missions" tabKey="missions">
                <section className="space-y-6">
                  <div className="border-b border-slate-800/80 pb-3">
                    <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2 sm:gap-2.5 font-['Orbitron']">
                      <Rocket className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />
                      <span>{t('missionsHeading')}</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      {t('missionsSubheading')}
                    </p>
                  </div>

                  {/* Direct Link Banner to Rocket Launch Simulator */}
                  <div className="p-4 sm:p-5 rounded-2xl bg-gradient-to-r from-orange-500/10 via-amber-500/10 to-transparent border border-orange-500/30 flex items-center justify-between flex-wrap gap-4 shadow-xl">
                    <div className="flex items-center gap-3.5">
                      <div className="w-11 h-11 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center shrink-0">
                        <Flame className="w-5 h-5 text-orange-400 animate-pulse" />
                      </div>
                      <div>
                        <h4 className="text-sm sm:text-base font-bold text-white font-['Orbitron']">
                          NASA Rocket Launch Control Simulator
                        </h4>
                        <p className="text-xs text-slate-400 font-mono mt-0.5">
                          Launch Complex 39B • Telemetry, Propellant Safety & Mission Control Terminal
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleTabSwitch('launch')}
                      className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-orange-600 to-amber-600 hover:from-orange-500 hover:to-amber-500 text-white font-mono text-xs font-bold transition shadow-lg shadow-orange-500/20 flex items-center gap-2 cursor-pointer"
                    >
                      <span>ENTER CONTROL ROOM</span>
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>

                  <MissionsTimeline 
                    lang={lang} 
                    initialMissionId={targetMissionId}
                  />

                  {/* Mars Rover Surface Image Hotspot Tagger */}
                  <MarsImageTagger />

                  {/* Solar Weather AI Alert System */}
                  <SolarWeather />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'launch' && (
              <AtmosphericEntryTransition key="entry-launch" tabKey="launch">
                <section className="space-y-6">
                  <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2 sm:gap-2.5 font-['Orbitron']">
                        <Flame className="w-5 h-5 sm:w-6 sm:h-6 text-orange-400 shrink-0" />
                        <span>NASA Rocket Launch Control Simulator</span>
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1">
                        KSC Launch Complex 39B • Interactive Propellant & Payload Telemetry Console
                      </p>
                    </div>
                  </div>

                  <RocketLaunchSimulator />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'news' && (
              <AtmosphericEntryTransition key="entry-news" tabKey="news">
                <section className="space-y-6">
                  <div className="border-b border-slate-800/80 pb-3">
                    <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2 sm:gap-2.5 font-['Orbitron']">
                      <Newspaper className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />
                      <span>{t('newsHeading')}</span>
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-400 mt-1">
                      {t('newsSubheading')}
                    </p>
                  </div>

                  {/* 2026/2027 Astronomical Event Calendar */}
                  <CosmicCalendar lang={lang} />

                  <NewsSection lang={lang} />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'saved' && (
              <AtmosphericEntryTransition key="entry-saved" tabKey="saved">
                <section className="space-y-4">
                  <SavedFavorites
                    lang={lang}
                    onNavigateToApod={(date) => {
                      if (date) setTargetApodDate(date);
                      handleTabSwitch('apod');
                    }}
                    onNavigateToMission={(missionId) => {
                      if (missionId) setTargetMissionId(missionId);
                      handleTabSwitch('missions');
                    }}
                  />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'quiz' && (
              <AtmosphericEntryTransition key="entry-quiz" tabKey="quiz">
                <section className="space-y-6">
                  {/* Smart Interactive Space Flight Quiz */}
                  <SmartSpaceQuiz />
                  <SpaceQuizModule lang={lang} />
                  <SpaceTriviaQuiz lang={lang} />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'iss' && (
              <AtmosphericEntryTransition key="entry-iss" tabKey="iss">
                <section className="space-y-6">
                  {/* Lightweight 2D HTML5 Canvas ISS Orbital Tracker */}
                  <IssTracker2D lang={lang} />

                  {/* Multi-Satellite Orbit Tracking Suite */}
                  <ISSTracker />
                </section>
              </AtmosphericEntryTransition>
            )}

            {!isTabLoading && displayedTab === 'assistant' && (
              <AtmosphericEntryTransition key="entry-assistant" tabKey="assistant">
                <section className="space-y-4">
                  <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between flex-wrap gap-3">
                    <div>
                      <h2 className="text-lg sm:text-xl md:text-2xl lg:text-3xl font-bold text-white flex items-center gap-2 sm:gap-2.5 font-['Orbitron']">
                        <Bot className="w-5 h-5 sm:w-6 sm:h-6 text-cyan-400 shrink-0" />
                        <span>NOVA - NASA Mission Control AI</span>
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1">
                        NASA Deep Space Intelligence & Mission Assistant • Fluent in English, සිංහල, and தமிழ்
                      </p>
                    </div>

                    {/* Gemini Live Real-Time Bidi Voice Comms Launcher */}
                    <button
                      onClick={() => setIsLiveVoiceModalOpen(true)}
                      className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-cyan-600/30 via-blue-600/30 to-indigo-600/30 hover:from-cyan-500/40 hover:to-blue-500/40 border border-cyan-400/50 hover:border-cyan-300 text-cyan-200 font-mono text-xs font-bold shadow-[0_0_20px_rgba(6,182,212,0.3)] transition hover:scale-105 active:scale-95 cursor-pointer"
                    >
                      <Radio className="w-4 h-4 text-cyan-400 animate-pulse" />
                      <span>
                        {lang === 'si' ? 'Gemini Live හඬ සබඳතාව' : lang === 'ta' ? 'Gemini Live குரல் இணைப்பு' : 'Gemini Live Voice Comms'}
                      </span>
                    </button>
                  </div>

                  <NasaAi lang={lang} />
                </section>
              </AtmosphericEntryTransition>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Glassmorphic Floating Gemini AI Chat Terminal (Desktop & Mobile) */}
      <GeminiChatWidget 
        lang={lang} 
        onNavigateToTab={(tabId: string) => handleTabSwitch(tabId as any)} 
      />

      {/* Gemini Live Real-Time Bidi Voice Comms Modal */}
      <GeminiLiveVoice
        lang={lang}
        isOpen={isLiveVoiceModalOpen}
        onClose={() => setIsLiveVoiceModalOpen(false)}
      />

      {/* Cosmic Dashboard Footer - Clean Cosmic Dark UI */}
      <footer className="relative z-10 mt-16 pb-28 bg-slate-900/90 border-t border-slate-800 py-10 text-xs text-slate-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-blue-900/60 border border-cyan-400/40 flex items-center justify-center font-['Orbitron'] font-bold text-[11px] text-rose-500 shadow-md">
              NASA
            </div>
            <div>
              <div className="text-white font-semibold font-['Orbitron']">{t('appName')}</div>
              <div className="text-[11px] text-slate-400 font-mono">
                {t('footerPoweredBy')}
              </div>
            </div>
          </div>

          {/* Ambient Deep Space Soundscape Synthesizer Control */}
          <div className="flex items-center justify-center">
            <AmbientSoundscapeControl lang={lang} />
          </div>

          <div className="flex items-center gap-5 text-xs">
            <button
              onClick={() => setIsExportModalOpen(true)}
              className="text-amber-400 hover:text-amber-300 font-medium flex items-center gap-1.5 transition"
            >
              <FileCode className="w-3.5 h-3.5" />
              <span>{t('navExportHtml')}</span>
            </button>
            <a
              href="https://api.nasa.gov"
              target="_blank"
              rel="noreferrer"
              className="text-slate-400 hover:text-cyan-400 transition flex items-center gap-1"
            >
              <span>NASA API Portal</span>
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>
        </div>
      </footer>

      {/* Offline Status & Cached Telemetry Indicator */}
      <OfflineIndicator lang={lang} />

      {/* Voice-Controlled 3D Navigation Hook Floating Mic Overlay */}
      <FloatingVoiceControl
        onNavigate={handleVoiceNavigate}
        onCameraAction={handleVoiceCameraAction}
        lang={lang === 'si' ? 'si-LK' : lang === 'ta' ? 'ta-IN' : 'en-US'}
        className="bottom-24 sm:bottom-24 right-4 sm:right-6 lg:bottom-8"
      />

      {/* iOS-Style Floating Glassmorphic Bottom Navigation Bar (Mobile & Tablet) */}
      <NASABottomBar
        activeTab={activeTab}
        onTabChange={(tabId: string) => handleTabSwitch(tabId as any)}
      />

      {/* Single HTML Export / Copy Modal */}
      <ExportHtmlModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        lang={lang}
      />
    </div>
  );
}
