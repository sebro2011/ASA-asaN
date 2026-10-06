import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, AnimatePresence } from 'framer-motion';
import { SupportedLanguage } from './i18n/translations';
import AnimatedNavbar from './components/AnimatedNavbar.jsx';
import CosmicStarfieldBackground from './components/CosmicStarfieldBackground.jsx';
import FloatingLanguageSwitcher from './components/FloatingLanguageSwitcher';
import AmbientSoundscapeControl from './components/AmbientSoundscapeControl';
import PulsarLoader from './components/PulsarLoader';
import AtmosphericEntryTransition from './components/AtmosphericEntryTransition';
import SlideToAction from './components/SlideToAction.jsx';
import NASABottomBar from './components/NASABottomBar.jsx';
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
  Flame
} from 'lucide-react';

type TabKey = 'apod' | '3d' | 'asteroids' | 'epic' | 'exoplanets' | 'missions' | 'launch' | 'news' | 'saved' | 'assistant' | 'quiz' | 'iss';

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

export default function App() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language || 'en').slice(0, 2) as SupportedLanguage;
  const [activeTab, setActiveTab] = useState<TabKey>('apod');
  const [displayedTab, setDisplayedTab] = useState<TabKey>('apod');
  const [isTabLoading, setIsTabLoading] = useState<boolean>(false);
  const [targetApodDate, setTargetApodDate] = useState<string | undefined>(undefined);
  const [targetMissionId, setTargetMissionId] = useState<string | undefined>(undefined);
  const [isExportModalOpen, setIsExportModalOpen] = useState<boolean>(false);
  const { totalCount, savedApods, savedMissionIds } = useFavorites();

  // Sync HTML title & lang
  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  const handleTabSwitch = (tab: TabKey) => {
    if (tab === activeTab && !isTabLoading) return;

    setActiveTab(tab);
    setIsTabLoading(true);

    const element = document.getElementById('main-tab-content');
    if (element) {
      element.scrollIntoView({ behavior: 'smooth' });
    }

    // Trigger glowing pulsar animation transition
    setTimeout(() => {
      setDisplayedTab(tab);
      setIsTabLoading(false);
    }, 420);
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

  return (
    <div className="min-h-screen bg-[#030712] text-slate-100 flex flex-col font-sans selection:bg-cyan-500/30 selection:text-cyan-200 relative overflow-x-hidden">
      {/* High-Performance 60FPS Cosmic Starfield & Meteor Particle Background */}
      <CosmicStarfieldBackground starCount={240} enableMeteors={true} speed={0.28} />

      {/* Floating Trilingual Language Switcher (Top-Right) */}
      <FloatingLanguageSwitcher />

      {/* Mission Control Live Telemetry Top Strip */}
      <div className="relative z-50 bg-slate-900/90 border-b border-slate-800/80 py-2 px-4 text-[11px] font-mono text-slate-300">
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

            <span className="hidden lg:inline text-slate-400">
              AI ENGINE: <span className="text-emerald-300 font-semibold">GEMINI 2.5 FLASH</span>
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
      <main className="relative z-10 flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-40 space-y-8">
        
        {/* Sleek Hero Banner - Clean Cosmic Dark UI */}
        <section className="relative">
          <div className="bg-slate-900/90 border border-slate-800 rounded-2xl p-5 sm:p-8 relative overflow-hidden shadow-xl flex flex-col lg:flex-row items-center justify-between gap-6">
            <div className="relative z-10 max-w-3xl space-y-4">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-slate-800/80 border border-slate-700/80 text-cyan-300 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                <span>
                  {lang === 'en' && 'Real-Time NASA Feed & Keyless AI Dynamic Translation'}
                  {lang === 'si' && 'නාසා සජීවී දත්ත සහ Keyless AI ස්වභාවික සිංහල පරිවර්තනය'}
                  {lang === 'ta' && 'நாசா நேரலை தரவு & Keyless AI துல்லிய தமிழ் மொழிபெயர்ப்பு'}
                </span>
              </div>

              <h1 className="text-2xl sm:text-4xl md:text-5xl font-black text-white tracking-tight leading-tight font-['Orbitron']">
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

              <p className="text-xs sm:text-sm md:text-base text-slate-300 leading-relaxed max-w-2xl font-sans">
                {lang === 'en' && 'Astronomy Picture of the Day (APOD), interactive 3D celestial mechanics, landmark spaceflight breakdowns from Apollo to Artemis, and live deep-space discoveries translated dynamically on-the-fly.'}
                {lang === 'si' && 'නාසා ආයතනයේ දවසේ තාරකා විද්‍යා ඡායාරූපය (APOD), ත්‍රිමාන (3D) අභ්‍යවකාශ ආකෘති, ඇපලෝ සිට ආටෙමිස් දක්වා ඓතිහාසික චන්ද්‍ර මෙහෙයුම් සහ සජීවී විද්‍යා පුවත් එකම වේදිකාවකින්.'}
                {lang === 'ta' && 'நாசாவின் நாளின் வானியல் புகைப்படம் (APOD), 3D கோளப் பார்வை, வரலாற்று விண்வெளி பயணங்களின் விரிவான தகவல்கள் மற்றும் நேரலைச் செய்திகள்.'}
              </p>

              {/* Slide To Action Quick Launcher */}
              <div className="pt-2 max-w-sm">
                <SlideToAction
                  label={
                    lang === 'si' ? 'ගවේෂණය සඳහා අදින්න' :
                    lang === 'ta' ? 'ஆராய ஸ்லைடு செய்யவும்' :
                    'Slide to Explore 3D Lab'
                  }
                  successLabel={
                    lang === 'si' ? '3D අභ්‍යවකාශගාරය විවෘතයි' :
                    lang === 'ta' ? '3D ஆய்வகம் திறக்கப்பட்டது' :
                    '3D Space Lab Launched!'
                  }
                  onSuccess={() => handleTabSwitch('3d')}
                />
              </div>
            </div>

            {/* Glowing Hero App Badge Logo Container */}
            <div className="hidden lg:flex flex-col items-center justify-center p-6 rounded-3xl bg-slate-950/50 border border-cyan-500/20 backdrop-blur-xl shadow-2xl relative shrink-0 group">
              <div className="absolute inset-0 bg-cyan-500/10 rounded-3xl blur-2xl group-hover:bg-cyan-500/20 transition-all" />
              <Logo size="xl" pulse={true} withGlow={true} />
              <div className="mt-3 text-center">
                <span className="font-['Orbitron'] font-black text-sm tracking-widest text-cyan-300">
                  NASA WEB APP
                </span>
                <p className="text-[10px] font-mono text-slate-400">
                  v2.5.0 • TRILINGUAL EDITION
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Space Dashboard Multi-Card Grid Hub - Clean Cosmic Dark UI */}
        <section className="relative">
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-12 gap-3 sm:gap-4">
            {/* Tile 1: APOD */}
            <motion.button
              whileHover={{ y: -4, scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('apod')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'apod'
                  ? 'ring-2 ring-cyan-400/80 shadow-[0_12px_36px_rgba(6,182,212,0.35)]'
                  : 'hover:border-cyan-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                  <Compass className="w-4 h-4 text-cyan-300" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-500/30">
                  DAILY
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('3d')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === '3d'
                  ? 'ring-2 ring-blue-400/80 shadow-[0_12px_36px_rgba(59,130,246,0.35)]'
                  : 'hover:border-blue-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-blue-500/20 border border-blue-500/40 flex items-center justify-center">
                  <Orbit className="w-4 h-4 text-blue-300" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-blue-500/15 text-blue-300 border border-blue-500/30">
                  3D
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('asteroids')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'asteroids'
                  ? 'ring-2 ring-rose-400/80 shadow-[0_12px_36px_rgba(244,63,94,0.35)]'
                  : 'hover:border-rose-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-rose-500/20 border border-rose-500/40 flex items-center justify-center">
                  <Target className="w-4 h-4 text-rose-300" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-rose-500/15 text-rose-300 border border-rose-500/30">
                  LIVE
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('epic')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'epic'
                  ? 'ring-2 ring-emerald-400/80 shadow-[0_12px_36px_rgba(16,185,129,0.35)]'
                  : 'hover:border-emerald-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center">
                  <Globe2 className="w-4 h-4 text-emerald-300" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30">
                  L1
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('exoplanets')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'exoplanets'
                  ? 'ring-2 ring-violet-400/80 shadow-[0_12px_36px_rgba(139,92,246,0.35)]'
                  : 'hover:border-violet-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-violet-500/20 border border-violet-500/40 flex items-center justify-center">
                  <Sparkles className="w-4 h-4 text-violet-300" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-300 border border-violet-500/30">
                  3D LAB
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('missions')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'missions'
                  ? 'ring-2 ring-amber-400/80 shadow-[0_12px_36px_rgba(245,158,11,0.35)]'
                  : 'hover:border-amber-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center">
                  <Rocket className="w-4 h-4 text-amber-300" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
                  FLIGHT
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('news')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'news'
                  ? 'ring-2 ring-teal-400/80 shadow-[0_12px_36px_rgba(20,184,166,0.35)]'
                  : 'hover:border-teal-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-teal-500/20 border border-teal-500/40 flex items-center justify-center">
                  <Newspaper className="w-4 h-4 text-teal-300" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-teal-500/15 text-teal-300 border border-teal-500/30">
                  LIVE
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('quiz')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'quiz'
                  ? 'ring-2 ring-cyan-400/80 shadow-[0_12px_36px_rgba(6,182,212,0.35)]'
                  : 'hover:border-cyan-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-cyan-500/20 border border-cyan-500/40 flex items-center justify-center">
                  <BrainCircuit className="w-4 h-4 text-cyan-300" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold">
                  QUIZ
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('iss')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'iss'
                  ? 'ring-2 ring-indigo-400/80 shadow-[0_12px_36px_rgba(99,102,241,0.35)]'
                  : 'hover:border-indigo-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-indigo-500/20 border border-indigo-500/40 flex items-center justify-center">
                  <Globe2 className="w-4 h-4 text-indigo-300 animate-spin" style={{ animationDuration: '30s' }} />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 font-bold flex items-center gap-1">
                  <span className="w-1 h-1 rounded-full bg-emerald-400 animate-ping" />
                  ORBIT
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('assistant')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'assistant'
                  ? 'ring-2 ring-purple-400/80 shadow-[0_12px_36px_rgba(168,85,247,0.35)]'
                  : 'hover:border-purple-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-purple-500/20 border border-purple-500/40 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-purple-300" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/30">
                  AI
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('saved')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'saved'
                  ? 'ring-2 ring-pink-400/80 shadow-[0_12px_36px_rgba(244,63,94,0.35)]'
                  : 'hover:border-pink-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center">
                  <Heart className={`w-4 h-4 ${totalCount > 0 ? 'text-pink-400 fill-pink-500/40' : 'text-pink-400'}`} />
                </div>
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
              whileTap={{ scale: 0.98 }}
              onClick={() => handleTabSwitch('launch')}
              className={`p-3.5 sm:p-4 rounded-2xl bg-slate-900/90 border border-slate-800 shadow-xl text-left transition-all duration-300 relative overflow-hidden flex flex-col justify-between ${
                activeTab === 'launch'
                  ? 'ring-2 ring-orange-400/80 shadow-[0_12px_36px_rgba(249,115,22,0.35)]'
                  : 'hover:border-orange-500/50'
              }`}
            >
              <div className="flex items-center justify-between w-full">
                <div className="w-8 h-8 rounded-2xl bg-orange-500/20 border border-orange-500/40 flex items-center justify-center">
                  <Flame className="w-4 h-4 text-orange-400 animate-pulse" />
                </div>
                <span className="text-[9px] font-mono px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30 font-bold">
                  SIM
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
                      <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                        <Compass className="w-6 h-6 text-cyan-400" />
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
                    <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                      <Orbit className="w-6 h-6 text-cyan-400" />
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

            {!isTabLoading && displayedTab === 'missions' && (
              <AtmosphericEntryTransition key="entry-missions" tabKey="missions">
                <section className="space-y-6">
                  <div className="border-b border-slate-800/80 pb-3">
                    <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                      <Rocket className="w-6 h-6 text-cyan-400" />
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
                      <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                        <Flame className="w-6 h-6 text-orange-400" />
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
                    <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                      <Newspaper className="w-6 h-6 text-cyan-400" />
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
                  <div className="border-b border-slate-800/80 pb-3 flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold text-white flex items-center gap-2.5 font-['Orbitron']">
                        <Bot className="w-6 h-6 text-purple-400" />
                        <span>NASA Astrophysics AI Assistant</span>
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-400 mt-1">
                        NASA Deep Space Intelligence & Mission Assistant • Fluent in English, සිංහල, and தமிழ்
                      </p>
                    </div>
                  </div>

                  <NasaAi lang={lang} />
                </section>
              </AtmosphericEntryTransition>
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Floating AI Assistant Quick Trigger (Desktop & Mobile) */}
      <button
        type="button"
        onClick={() => handleTabSwitch('assistant')}
        className={`fixed bottom-24 sm:bottom-8 right-5 z-40 p-3 sm:px-4 sm:py-3 rounded-full flex items-center gap-2 shadow-2xl transition-all duration-300 ${
          activeTab === 'assistant'
            ? 'bg-gradient-to-r from-purple-600/90 to-indigo-600/90 text-white ring-2 ring-purple-400 scale-105 shadow-purple-500/50 backdrop-blur-xl'
            : 'bg-slate-900/90 border border-slate-800 text-purple-300 hover:text-white hover:scale-105 shadow-xl'
        }`}
        title="Open NASA AI Assistant"
      >
        <div className="relative">
          <Bot className="w-5 h-5 text-purple-300" />
          <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
        </div>
        <span className="hidden sm:inline text-xs font-bold font-['Orbitron'] tracking-wider">
          NASA AI
        </span>
      </button>

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
        className="bottom-24 sm:bottom-24 right-5"
      />

      {/* Telemetry & Navigation Stacking: Single Fixed Footer Container */}
      <div className="fixed bottom-0 left-0 right-0 z-50 flex flex-col items-center pointer-events-none">
        {/* Floating Mission Control Telemetry Bar */}
        <div className="pointer-events-auto mb-2 px-3 sm:px-4 py-1.5 rounded-full bg-slate-900/90 backdrop-blur-md border border-slate-800/80 shadow-2xl flex items-center gap-2.5 sm:gap-3 text-[10px] sm:text-[11px] font-mono select-none">
          <span className="flex items-center gap-1.5 text-cyan-300 font-semibold">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
            </span>
            DSN LIVE LINK
          </span>
          <span className="text-slate-600">|</span>
          <span className="flex items-center gap-1 text-slate-300">
            <Clock className="w-3 h-3 text-cyan-400" />
            <LiveUtcClock />
          </span>
          <span className="hidden sm:inline text-slate-600">|</span>
          <span className="hidden sm:inline text-slate-400">
            <IssTelemetryIndicator />
          </span>
        </div>

        {/* Responsive iOS-Style Bottom Navigation Bar with Spring Bounce Animation */}
        <NASABottomBar
          activeTab={activeTab}
          onTabChange={(tabId: string) => handleTabSwitch(tabId as any)}
        />
      </div>

      {/* Single HTML Export / Copy Modal */}
      <ExportHtmlModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        lang={lang}
      />
    </div>
  );
}
